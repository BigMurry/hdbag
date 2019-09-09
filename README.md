# hdbag
integrate hdwallet with etherjs wallet

# Usage
```javascript
const {createWallets, bulkSendTx} = require('hdbag');
const seeds = 'history hybrid among bike math potato pen cinnamon million drift acoustic joy';
const walletCount = 10;

// key is the chainId
const ethNodes = {
  1: '', // mainnet rpc node
  3: '', // ropsten rpc node
  5: '', // goerli rpc node
  1000: '' // your private chain rpc node
};

// your local gettor function to fetch the nonce
function localNonceGettor(address, chainId) {
  return 1;
}

const wallets = createWallets(seeds, walletCount, ethNodes, localNonceGettor);
const wallet0 = wallets.get(0);

const incNonce = 0; // nonce increase amount
const tx = {
  to: '', // contract or EOA address - address
  data: '', // calldata - bytes
  gasLimit: 21000, // gasLimit - number
  gasPrice: '', // gasPrice - wei number string
  chainId: 1 // chain id - number
};
const {txHash} = await wallet0.sendTx(tx, incNonce);

const txs = await bulkSendTx(wallet0, [tx]);

```
