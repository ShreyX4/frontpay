// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
    InvoiceFactoring — small-business invoice advances funded by a USDC pool on Arc.

    Flow:
      1. Investors deposit USDC into the pool and receive pool shares.
      2. A business registers an unpaid invoice (its fingerprint must be new: no double-financing).
      3. The customer (debtor) confirms onchain that they owe the invoice.
      4. The underwriter (contract owner) sets an offer: advance % and fee per 30 days.
      5. The business accepts: the pool sends the advance (e.g. 85%) immediately.
      6. The debtor pays the full invoice into this contract. It splits automatically:
         advance + fee back to the pool, the remainder to the business.
      7. If unpaid after due date + grace period, anyone can mark it defaulted.
         The first-loss fund absorbs the loss first, then the pool.
         A late payment after default is still accepted and recovers the loss.

    Amounts use USDC's ERC-20 interface on Arc (6 decimals): $1.00 = 1_000_000.
    Arc testnet USDC (ERC-20 interface): 0x3600000000000000000000000000000000000000
*/

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract InvoiceFactoring {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum Status {
        None,        // 0
        Registered,  // 1  business submitted it
        Confirmed,   // 2  debtor confirmed they owe it
        Offered,     // 3  underwriter set terms
        Funded,      // 4  advance paid to business
        Repaid,      // 5  debtor paid in full
        Defaulted,   // 6  past due + grace, written off
        Rejected     // 7  underwriter declined
    }

    struct Invoice {
        address business;
        address debtor;
        uint256 faceAmount;      // full invoice amount (6 decimals)
        uint256 dueDate;         // unix timestamp
        bytes32 fingerprint;     // hash of the invoice's identifying data
        string invoiceRef;        // e.g. invoice number or a link to the document
        uint16 advanceBps;       // e.g. 8500 = 85%
        uint16 feeBpsPer30Days;  // e.g. 150 = 1.5% per 30 days
        uint256 advanceAmount;   // paid to business at funding
        uint256 feeAmount;       // fixed at funding, earned by the pool
        uint256 fundedAt;
        uint256 settledAt;
        Status status;
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    IERC20 public immutable usdc;
    address public owner; // acts as underwriter / risk manager

    // Pool accounting
    uint256 public idleCash;            // USDC available in the pool
    uint256 public outstandingPrincipal; // advances currently out
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    // Risk accounting
    uint256 public firstLossFund;       // platform capital that absorbs defaults first
    uint256 public totalFeesEarned;
    uint256 public totalLosses;         // losses borne by the pool (after first-loss)
    uint256 public totalRecovered;      // late recoveries on defaulted invoices

    // Risk limits (owner-set)
    uint16 public maxAdvanceBps = 9000;          // never advance more than 90%
    uint16 public maxFeeBpsPer30Days = 500;      // never charge more than 5% / 30 days
    uint256 public maxAdvancePerInvoice = 50_000 * 1e6; // $50,000 cap per invoice
    uint256 public gracePeriod = 30 days;

    // Invoices
    Invoice[] private invoices;
    mapping(bytes32 => bool) public fingerprintUsed;

    // Reentrancy guard
    uint256 private locked = 1;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Deposited(address indexed investor, uint256 amount, uint256 sharesMinted);
    event Withdrawn(address indexed investor, uint256 amount, uint256 sharesBurned);
    event FirstLossDeposited(uint256 amount);
    event InvoiceRegistered(uint256 indexed id, address indexed business, address indexed debtor, uint256 faceAmount, uint256 dueDate, bytes32 fingerprint);
    event InvoiceConfirmed(uint256 indexed id, address indexed debtor);
    event OfferSet(uint256 indexed id, uint16 advanceBps, uint16 feeBpsPer30Days, uint256 advanceAmount, uint256 feeAmount);
    event InvoiceRejected(uint256 indexed id, string reason);
    event InvoiceFunded(uint256 indexed id, address indexed business, uint256 advanceAmount, uint256 feeAmount);
    event InvoiceRepaid(uint256 indexed id, address indexed payer, uint256 toPool, uint256 toBusiness);
    event InvoiceDefaulted(uint256 indexed id, uint256 coveredByFirstLoss, uint256 poolLoss);
    event DefaultRecovered(uint256 indexed id, uint256 recoveredToPool, uint256 toFirstLoss, uint256 toBusiness);
    event RiskLimitsUpdated(uint16 maxAdvanceBps, uint16 maxFeeBpsPer30Days, uint256 maxAdvancePerInvoice, uint256 gracePeriod);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier nonReentrant() {
        require(locked == 1, "Reentrancy");
        locked = 2;
        _;
        locked = 1;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "USDC address required");
        usdc = IERC20(usdcAddress);
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ---------------------------------------------------------------------
    // Investor functions (the pool)
    // ---------------------------------------------------------------------

    /// @notice Value of the pool: idle cash plus advances still outstanding (at cost).
    function totalAssets() public view returns (uint256) {
        return idleCash + outstandingPrincipal;
    }

    /// @notice USDC value of one share, scaled by 1e6 (1_000_000 = $1.00 per share).
    function sharePrice() external view returns (uint256) {
        if (totalShares == 0) return 1e6;
        return (totalAssets() * 1e6) / totalShares;
    }

    function previewDeposit(uint256 amount) public view returns (uint256) {
        if (totalShares == 0 || totalAssets() == 0) return amount;
        return (amount * totalShares) / totalAssets();
    }

    function previewWithdraw(uint256 shareAmount) public view returns (uint256) {
        if (totalShares == 0) return 0;
        return (shareAmount * totalAssets()) / totalShares;
    }

    /// @notice Deposit USDC into the pool. Approve this contract on the USDC token first.
    function deposit(uint256 amount) external nonReentrant returns (uint256 minted) {
        require(amount > 0, "Amount must be > 0");
        minted = previewDeposit(amount);
        require(minted > 0, "Deposit too small");
        _pullUSDC(msg.sender, amount);
        idleCash += amount;
        totalShares += minted;
        shares[msg.sender] += minted;
        emit Deposited(msg.sender, amount, minted);
    }

    /// @notice Withdraw by burning shares. Limited to idle cash (money not lent out).
    function withdraw(uint256 shareAmount) external nonReentrant returns (uint256 amount) {
        require(shareAmount > 0 && shareAmount <= shares[msg.sender], "Invalid share amount");
        amount = previewWithdraw(shareAmount);
        require(amount <= idleCash, "Not enough idle cash; funds are lent out");
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        idleCash -= amount;
        _pushUSDC(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, shareAmount);
    }

    // ---------------------------------------------------------------------
    // Business + debtor functions
    // ---------------------------------------------------------------------

    /// @notice Helper so apps and Remix users build fingerprints the same way.
    ///         Normalize text first (trim, lowercase) so the same invoice always hashes the same.
    function computeFingerprint(
        string calldata sellerId,      // e.g. seller's business number
        string calldata debtorId,      // e.g. customer's business number
        string calldata invoiceNumber,
        uint256 faceAmount,
        uint256 invoiceDate
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(sellerId, debtorId, invoiceNumber, faceAmount, invoiceDate));
    }

    /// @notice Business submits an unpaid invoice. Rejects any invoice already submitted.
    function registerInvoice(
        address debtor,
        uint256 faceAmount,
        uint256 dueDate,
        bytes32 fingerprint,
        string calldata invoiceRef
    ) external returns (uint256 id) {
        require(debtor != address(0) && debtor != msg.sender, "Invalid debtor");
        require(faceAmount > 0, "Amount must be > 0");
        require(dueDate > block.timestamp, "Due date must be in the future");
        require(fingerprint != bytes32(0), "Fingerprint required");
        require(!fingerprintUsed[fingerprint], "Duplicate invoice: already financed or submitted");

        fingerprintUsed[fingerprint] = true;
        id = invoices.length;
        invoices.push(Invoice({
            business: msg.sender,
            debtor: debtor,
            faceAmount: faceAmount,
            dueDate: dueDate,
            fingerprint: fingerprint,
            invoiceRef: invoiceRef,
            advanceBps: 0,
            feeBpsPer30Days: 0,
            advanceAmount: 0,
            feeAmount: 0,
            fundedAt: 0,
            settledAt: 0,
            status: Status.Registered
        }));
        emit InvoiceRegistered(id, msg.sender, debtor, faceAmount, dueDate, fingerprint);
    }

    /// @notice The customer confirms onchain that they owe this invoice.
    function confirmInvoice(uint256 id) external {
        Invoice storage inv = _get(id);
        require(msg.sender == inv.debtor, "Only the debtor can confirm");
        require(inv.status == Status.Registered, "Not awaiting confirmation");
        inv.status = Status.Confirmed;
        emit InvoiceConfirmed(id, msg.sender);
    }

    /// @notice Business accepts the offer and receives the advance immediately.
    function acceptOffer(uint256 id) external nonReentrant {
        Invoice storage inv = _get(id);
        require(msg.sender == inv.business, "Only the business can accept");
        require(inv.status == Status.Offered, "No open offer");
        require(block.timestamp < inv.dueDate, "Invoice already due");
        require(inv.advanceAmount <= idleCash, "Pool lacks liquidity");

        inv.status = Status.Funded;
        inv.fundedAt = block.timestamp;
        idleCash -= inv.advanceAmount;
        outstandingPrincipal += inv.advanceAmount;
        _pushUSDC(inv.business, inv.advanceAmount);
        emit InvoiceFunded(id, inv.business, inv.advanceAmount, inv.feeAmount);
    }

    /// @notice Pay the full invoice. Usually the debtor; anyone may pay on their behalf.
    ///         Approve this contract for faceAmount on the USDC token first.
    function repay(uint256 id) external nonReentrant {
        Invoice storage inv = _get(id);
        require(inv.status == Status.Funded || inv.status == Status.Defaulted, "Not payable");

        uint256 toPool = inv.advanceAmount + inv.feeAmount;
        uint256 toBusiness = inv.faceAmount - toPool;
        bool wasDefaulted = inv.status == Status.Defaulted;

        inv.status = Status.Repaid;
        inv.settledAt = block.timestamp;
        _pullUSDC(msg.sender, inv.faceAmount);

        if (!wasDefaulted) {
            outstandingPrincipal -= inv.advanceAmount;
            idleCash += toPool;
            totalFeesEarned += inv.feeAmount;
            emit InvoiceRepaid(id, msg.sender, toPool, toBusiness);
        } else {
            // Late recovery: pool gets back what it lost plus the fee first,
            // then the first-loss fund is refilled, then the business gets the rest.
            uint256 poolLoss = _poolLossFor(id);
            uint256 toFirstLoss = inv.advanceAmount - poolLoss; // what first-loss covered
            uint256 toPoolNow = poolLoss + inv.feeAmount;
            idleCash += toPoolNow;
            totalLosses -= poolLoss;
            totalFeesEarned += inv.feeAmount;
            firstLossFund += toFirstLoss;
            totalRecovered += inv.advanceAmount;
            emit DefaultRecovered(id, toPoolNow, toFirstLoss, toBusiness);
        }

        if (toBusiness > 0) _pushUSDC(inv.business, toBusiness);
    }

    /// @notice Anyone can mark an invoice defaulted once it is past due + grace period.
    function markDefault(uint256 id) external {
        Invoice storage inv = _get(id);
        require(inv.status == Status.Funded, "Not funded");
        require(block.timestamp > inv.dueDate + gracePeriod, "Grace period not over");

        inv.status = Status.Defaulted;
        inv.settledAt = block.timestamp;
        outstandingPrincipal -= inv.advanceAmount;

        uint256 covered = inv.advanceAmount <= firstLossFund ? inv.advanceAmount : firstLossFund;
        firstLossFund -= covered;
        idleCash += covered;                      // first-loss capital moves into the pool
        uint256 poolLoss = inv.advanceAmount - covered;
        totalLosses += poolLoss;
        defaultPoolLoss[id] = poolLoss;
        emit InvoiceDefaulted(id, covered, poolLoss);
    }

    mapping(uint256 => uint256) public defaultPoolLoss;

    // ---------------------------------------------------------------------
    // Underwriter (owner) functions
    // ---------------------------------------------------------------------

    /// @notice Set the advance terms for a confirmed invoice. The fee is fixed now,
    ///         based on days until the due date (rounded up, minimum 1 day).
    function setOffer(uint256 id, uint16 advanceBps, uint16 feeBpsPer30Days) external onlyOwner {
        Invoice storage inv = _get(id);
        require(inv.status == Status.Confirmed || inv.status == Status.Offered, "Debtor has not confirmed");
        require(advanceBps > 0 && advanceBps <= maxAdvanceBps, "Advance % over limit");
        require(feeBpsPer30Days <= maxFeeBpsPer30Days, "Fee over limit");
        require(block.timestamp < inv.dueDate, "Invoice already due");

        uint256 advance = (inv.faceAmount * advanceBps) / 10_000;
        require(advance <= maxAdvancePerInvoice, "Advance over per-invoice cap");

        uint256 secondsLeft = inv.dueDate - block.timestamp;
        uint256 daysLeft = (secondsLeft + 1 days - 1) / 1 days;
        if (daysLeft == 0) daysLeft = 1;
        uint256 fee = (advance * feeBpsPer30Days * daysLeft) / (10_000 * 30);
        require(advance + fee <= inv.faceAmount, "Advance + fee exceeds invoice");

        inv.advanceBps = advanceBps;
        inv.feeBpsPer30Days = feeBpsPer30Days;
        inv.advanceAmount = advance;
        inv.feeAmount = fee;
        inv.status = Status.Offered;
        emit OfferSet(id, advanceBps, feeBpsPer30Days, advance, fee);
    }

    function rejectInvoice(uint256 id, string calldata reason) external onlyOwner {
        Invoice storage inv = _get(id);
        require(
            inv.status == Status.Registered || inv.status == Status.Confirmed || inv.status == Status.Offered,
            "Cannot reject now"
        );
        inv.status = Status.Rejected;
        // Fingerprint stays used: a rejected invoice can't be resubmitted under a new id.
        emit InvoiceRejected(id, reason);
    }

    /// @notice Platform puts its own capital at risk ahead of investors.
    function depositFirstLoss(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Amount must be > 0");
        _pullUSDC(msg.sender, amount);
        firstLossFund += amount;
        emit FirstLossDeposited(amount);
    }

    function setRiskLimits(
        uint16 _maxAdvanceBps,
        uint16 _maxFeeBpsPer30Days,
        uint256 _maxAdvancePerInvoice,
        uint256 _gracePeriod
    ) external onlyOwner {
        require(_maxAdvanceBps <= 9500, "Max advance too high");
        require(_maxFeeBpsPer30Days <= 1000, "Max fee too high");
        maxAdvanceBps = _maxAdvanceBps;
        maxFeeBpsPer30Days = _maxFeeBpsPer30Days;
        maxAdvancePerInvoice = _maxAdvancePerInvoice;
        gracePeriod = _gracePeriod; // set to 0 for a quick demo of the default flow
        emit RiskLimitsUpdated(_maxAdvanceBps, _maxFeeBpsPer30Days, _maxAdvancePerInvoice, _gracePeriod);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function invoiceCount() external view returns (uint256) {
        return invoices.length;
    }

    function getInvoice(uint256 id) external view returns (Invoice memory) {
        require(id < invoices.length, "No such invoice");
        return invoices[id];
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _get(uint256 id) internal view returns (Invoice storage) {
        require(id < invoices.length, "No such invoice");
        return invoices[id];
    }

    function _poolLossFor(uint256 id) internal view returns (uint256) {
        return defaultPoolLoss[id];
    }

    function _pullUSDC(address from, uint256 amount) internal {
        uint256 before = usdc.balanceOf(address(this));
        require(usdc.transferFrom(from, address(this), amount), "USDC transferFrom failed");
        require(usdc.balanceOf(address(this)) - before == amount, "USDC amount mismatch");
    }

    function _pushUSDC(address to, uint256 amount) internal {
        require(usdc.transfer(to, amount), "USDC transfer failed");
    }
}
