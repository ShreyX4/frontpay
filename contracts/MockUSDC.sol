// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract MockUSDC {
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    function decimals() external pure returns (uint8){return 6;}
    function mint(address to,uint256 a) external {balanceOf[to]+=a;}
    function approve(address s,uint256 a) external returns(bool){allowance[msg.sender][s]=a;return true;}
    function transfer(address t,uint256 a) external returns(bool){require(balanceOf[msg.sender]>=a,"bal");balanceOf[msg.sender]-=a;balanceOf[t]+=a;return true;}
    function transferFrom(address f,address t,uint256 a) external returns(bool){require(balanceOf[f]>=a,"bal");require(allowance[f][msg.sender]>=a,"allow");allowance[f][msg.sender]-=a;balanceOf[f]-=a;balanceOf[t]+=a;return true;}
}
