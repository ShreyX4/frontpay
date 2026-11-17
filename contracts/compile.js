const solc=require('solc'),fs=require('fs');
const input={language:'Solidity',sources:{'InvoiceFactoring.sol':{content:fs.readFileSync('InvoiceFactoring.sol','utf8')},'MockUSDC.sol':{content:fs.readFileSync('MockUSDC.sol','utf8')}},settings:{optimizer:{enabled:true,runs:200},viaIR:false,evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const out=JSON.parse(solc.compile(JSON.stringify(input)));
(out.errors||[]).forEach(e=>console.log(e.severity, e.formattedMessage));
fs.writeFileSync('build.json',JSON.stringify(out.contracts));
console.log('compiled');
