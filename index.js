const Mnemonic = require('bitcore-mnemonic');
const { fromExtendedKey } = require('ethereumjs-wallet/hdkey');
const _ = require('lodash');
const {
  addHexPrefix,
  ecsign
} = require('ethereumjs-util');
const Tx = require('ethereumjs-tx');
const ethers = require('ethers');

// See https://github.com/ethereum/EIPs/issues/85
const BIP44_PATH = `m/44'/60'/0'/0`;

function defaultLocalNonce(address, chainId) {
  return 0;
}

// ethNodes = {1: URL, 101: URL}
function createWallets(seeds, count, ethNodes, localNonceGetter = defaultLocalNonce) {
  const store = {
    size: count,
    wallets: [],
    addrIdx: {}, // 0x345.. -> 0, 0xab445.. -> 1
    addrList: [],
    get: idxOrAddress => _getWallet(store, idxOrAddress)
  };

  const { xprivkey } = new Mnemonic(seeds).toHDPrivateKey();
  const hdKey = fromExtendedKey(xprivkey);
  const root = hdKey.derivePath(BIP44_PATH);
  for (let i = 0; i < count; ++i) {
    const wallet = new Wallet(root, i, ethNodes, localNonceGetter);
    const address = _.toLower(wallet.address);
    store.wallets.push(wallet);
    store.addrIdx[address] = i;
    store.addrList.push(address);
  }

  return store;
}

function _getWallet(store, idxOrAddress) {
  if (/^\d+$/.test(idxOrAddress)) {
    return _.get(store, ['wallets', idxOrAddress], null);
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(idxOrAddress)) {
    const idx = _.get(store, ['addrIdx', _.toLower(idxOrAddress)]);
    return _.get(store, ['wallets', idx], null);
  }
  return null;
}

class Wallet {
  constructor(hdRoot, index, ethNodes, localNonceGetter) {
    this._wallet = hdRoot.deriveChild(index).getWallet();
    this.address = addHexPrefix(this._wallet.getAddress().toString('hex'));
    this.etherWallet = new ethers.Wallet(this._wallet.getPrivateKey());
    this.hdIndex = index;
    this.localNonceGetter = localNonceGetter;
    this.etherWallets = {};
    const nodeTypes = Object.keys(ethNodes);
    for (let i = 0; i < nodeTypes.length; ++i) {
      const t = nodeTypes[i];
      this.etherWallets[t] = new ethers.Wallet(this._wallet.getPrivateKey(), new ethers.providers.JsonRpcProvider(ethNodes[t]));
    }
  }

  signObj(types, values) {
    const hash = ethers.utils.solidityKeccak256(types, values);
    return this.sign(hash);
  }

  sign(msgHash) {
    msgHash = Buffer.from(msgHash.replace(/^0x/, ''), 'hex');
    const sig = ecsign(msgHash, this._wallet.getPrivateKey());
    const ret = {
      r: sig.r.toString('hex'),
      s: sig.s.toString('hex'),
      v: sig.v
    };
    ret.messageHash = msgHash.toString('hex');
    ret.signature = `${ret.r}${ret.s}${ret.v.toString(16)}`;
    return ret;
  }

  signTx(rawTx) {
    const tx = new Tx(rawTx);
    tx.sign(this._wallet.getPrivateKey());
    const serialTx = tx.serialize();
    return `0x${serialTx.toString('hex')}`;
  }

  async sendTx(tx, incNonce = 0) {
    const {to, data, gasLimit, gasPrice, chainId} = tx;
    const self = this;
    const etherWallet = self.etherWallets[chainId];
    if (!etherWallet) {
      throw new Error(`ether wallet for node type :${chainId} not found.`);
    }
    const [chainNonce, dbNonce] = await Promise.all([
      etherWallet.getTransactionCount('pending'),
      self.localNonceGetter(self.address, chainId)
    ]);
    const nonce = Math.max(chainNonce, dbNonce) + incNonce;
    const txRes = await etherWallet.sendTransaction({
      to,
      data,
      gasLimit,
      gasPrice,
      nonce,
      chainId
    });
    return {txHash: txRes.hash, nonce, operator: self.address, gasLimit, gasPrice};
  }
}

async function bulkSendTx(wallet, txs = []) {
  const cache = {};
  const res = await Promise.all(txs.map(tx => {
    const {chainId} = tx;
    const incNonce = _.get(cache, [chainId], 0);
    cache[chainId] = incNonce + 1;
    return wallet.sendTx(tx, incNonce);
  }));
  return res;
}

module.exports = {
  createWallets,
  bulkSendTx
};
