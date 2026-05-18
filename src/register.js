const { ethers } = require('ethers');
require('dotenv').config();

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ABI = [
  'function register(string agentURI) returns (uint256)',
  'event AgentRegistered(uint256 indexed agentId, address indexed owner)',
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.GOAT_RPC);
  const wallet = new ethers.Wallet(process.env.GOAT_PRIVATE_KEY, provider);
  const registry = new ethers.Contract(IDENTITY_REGISTRY, ABI, wallet);
  const agentURI = `${process.env.GITHUB_PAGES_URL}/agent.json`;

  console.log('📡 Registering on ERC-8004...');
  console.log('   URI:', agentURI);

  const tx = await registry['register(string)'](agentURI);
  console.log('   TX sent:', tx.hash);
  const receipt = await tx.wait();

  const iface = new ethers.Interface(ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === 'AgentRegistered') {
        console.log('\n✅ Registered!');
        console.log('   Agent ID:', parsed.args.agentId.toString());
        console.log('   TX Hash:', tx.hash);
        console.log('\n👉 Add to .env → AGENT_ID=' + parsed.args.agentId.toString());
      }
    } catch (_) {}
  }
}

main().catch(console.error);