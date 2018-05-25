const CryptoJS = require("crypto-js"),
  elliptic = require("elliptic"),
  _ = require("lodash"),
  utils = require("./utils");

// elliptic를 init 해줘야 쓸 수 있음. 이유는 복잡. 이거하면 이제 프라이빗, 퍼블릭 키 사용 가능
const ec = new elliptic.ec("secp256k1");

const COINBASE_AMOUNT = 50;

class TxOut {
  constructor(address, amount) {
    this.address = address;
    this.amount = amount;
  }
}

class TxIn {
  // 인풋은 결국 이전 트랜잭션의 사용되지 않은 아웃풋
  // TxOutId : 사용되지 않은 TxOut Id
  // TxOutIndex
  // Signature
}

class Transaction {
  // ID
  // txIns[]
  // txOuts[]
}

// Unspent TxOut
class UTxOut {
  constructor(txOutId, txOutIndex, address, amount) {
    this.txOutId = txOutId;
    this.txOutIndex = txOutIndex;
    this.address = address;
    this.amount = amount;
  }
}

// 트랜잭션 ID는 트랜잭션 인풋과 아웃풋을 함께 해쉬한다
const getTxId = tx => {
  const txInContent = tx.txIns
    .map(txIn => txIn.txOutId + txIn.txOutIndex)
    .reduce((a, b) => a + b, "");

  const txOutContent = tx.txOuts
    .map(txOut => txOut.address + txOut.amount)
    .reduce((a, b) => a + b, "");

  return CryptoJS.SHA256(txInContent + txOutContent + tx.timestamp).toString();
};

// 인풋이 참고하는 전의 아웃풋 찾기
const findUTxOut = (txOutId, txOutIndex, uTxOutList) => {
  return uTxOutList.find(
    uTxO => uTxO.txOutId === txOutId && uTxO.txOutIndex === txOutIndex
  );
};

// 인풋을 사인하면 블록체인에게 유효하다고 검증해주는 것. 우리의 인풋이라고.
// 인풋을 사인하려면, 아웃풋을 찾아야함.
// 트랜잭션을 사인해서. 사람들에게 해당 인풋은 내것이라고 얘기하는 것.
const signTxIn = (tx, txInIndex, privateKey, uTxOutList) => {
  const txIn = tx.txIns[txInIndex];
  const dataToSign = tx.id;

  // referencedUTxOut은 여기서 인풋으로 사용되는 전의 아웃풋이라는 말. 모든 인풋은 전의 아웃풋
  const referencedUTxOut = findUTxOut(
    txIn.txOutId,
    txIn.txOutIndex,
    uTxOutList
  );
  if (referencedUTxOut === null) {
    // 내가 쓸 돈이 없다는 뜻
    return;
  }

  // 트랜잭션 인풋 주소가 지갑에서 얻은 주소와 같은지 체크
  // 프라이빗키는 uTxOut의 주인임을 증명하기에, 이게 없으면 안됨
  const referencedAddress = referencedUTxOut.address;
  if (getPublicKey(privateKey) !== referencedAddress) {
    return false;
  }

  const key = ec.keyFromPrivate(privateKey, "hex");
  // DER은 사인 포맷 중 하나.
  // string으로 바꿔주기
  const signature = utils.toHexString(key.sign(dataToSign).toDER());
  return signature;
};

const getPublicKey = privateKey => {
  return ec
    .keyFromPrivate(privateKey, "hex")
    .getPublic()
    .encode("hex");
};

// [A(40), B, C, D, E, F, G]
// A(40) ---> TRANSACTION ---> ZZ(10)
//                        ---> MM(30)
//   첫째로 ZZ와 MM에게 준 거래 아웃풋을 어레이에 넣고
//   사용된 A를 비운다.
//   마지막으로 위에 어레이에 사용된 A를 지우고, 새로운 거래 아웃풋 2개를 어레이에 추가한다.
const updateUTxOuts = (newTxs, uTxOutList) => {
  const newUTxOuts = newTxs
    .map(tx =>
      tx.txOuts.map(
        (txOut, index) => new UTxOut(tx.id, index, txOut.address, txOut.amount)
      )
    )
    .reduce((a, b) => a.concat(b), []);

  const spentTxOuts = newTxs
    .map(tx => tx.txIns)
    .reduce((a, b) => a.concat(b), [])
    .map(txIn => new UTxOut(txIn.txOutId, txIn.txOutIndex, "", 0));

  const resultingUTxOuts = uTxOutList
    .filter(uTxO => !findUTxOut(uTxO.txOutId, uTxO.txOutIndex, spentTxOuts))
    .concat(newUTxOuts);
  return resultingUTxOuts;
};

const isTxInStructureValid = txIn => {
  if (txIn === null) {
    console.log("The txIn appears to be null");
    return false;
  } else if (typeof txIn.signature !== "string") {
    console.log("The txIn doesn't have a valid signature");
    return false;
  } else if (typeof txIn.txOutId !== "string") {
    console.log("The txIn doesn't have a valid txOutId");
    return false;
  } else if (typeof txIn.txOutIndex !== "number") {
    console.log("The txIn doesn't have a valid txOutIndex");
    return false;
  } else {
    return true;
  }
};

const isAddressValid = address => {
  // 아래는 우리가 쓴 주소 어드레스에 대한 조건을 구글링해서 찾아낸 것.
  if (address.length !== 130) {
    console.log("The address length is not the expected one");
    return false;
  } else if (address.match("^[a-fA-F0-9]+$") === null) {
    console.log("The address doesn't match the hex patter");
    return false;
  } else if (!address.startsWith("04")) {
    console.log("The address doesn't start with 04");
    return false;
  } else {
    return true;
  }
};

const isTxOutStructureValid = txOut => {
  if (txOut === null) {
    return false;
  } else if (typeof txOut.address !== "string") {
    console.log("The txOut doesn't have a valid string as address");
    return false;
  } else if (!isAddressValid(txOut.address)) {
    console.log("The txOut doesn't have a valid address");
    return false;
  } else if (typeof txOut.amount !== "number") {
    console.log("The txOut doesn't have a valid amount");
    return false;
  } else {
    return true;
  }
};

// 트랜잭션 유효성 검증
const isTxStructureValid = tx => {
  if (typeof tx.id !== "string") {
    console.log("Tx ID is not valid");
    return false;
  } else if (!(tx.txIns instanceof Array)) {
    console.log("The txIns are not an array");
    return false;
  } else if (
    !tx.txIns.map(isTxInStructureValid).reduce((a, b) => a && b, true)
  ) {
    console.log("The structure of one of the txIn is not valid");
    return false;
  } else if (!(tx.txOuts instanceof Array)) {
    console.log("The txOuts are not an array");
    return false;
  } else if (
    !tx.txOuts.map(isTxOutStructureValid).reduce((a, b) => a && b, true)
  ) {
    console.log("The structure of one of the txOut is not valid");
    return false;
  } else {
    return true;
  }
};

const validateTxIn = (txIn, tx, uTxOutList) => {
  // 인풋이 참조한 아웃풋 찾기.
  const wantedTxOut = uTxOutList.find(
    uTxO => uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex
  );
  if (wantedTxOut === undefined) {
    console.log(`Didn't find the wanted uTxOut, the tx: ${tx} is invalid`);
    return false;
  } else {
    const address = wantedTxOut.address;
    const key = ec.keyFromPublic(address, "hex");
    return key.verify(tx.id, txIn.signature);
  }
};

const getAmountInTxIn = (txIn, uTxOutList) =>
  findUTxOut(txIn.txOutId, txIn.txOutIndex, uTxOutList).amount;

const validateTx = (tx, uTxOutList) => {
  if (!isTxStructureValid(tx)) {
    console.log("Tx structure is invalid");
    return false;
  }

  if (getTxId(tx) !== tx.id) {
    console.log("Tx ID is not valid");
    return false;
  }

  const hasValidTxIns = tx.txIns.map(txIn =>
    validateTxIn(txIn, tx, uTxOutList)
  );

  if (!hasValidTxIns) {
    console.log(`The tx: ${tx} doesn't have valid txIns`);
    return false;
  }

  const amountInTxIns = tx.txIns
    .map(txIn => getAmountInTxIn(txIn, uTxOutList))
    .reduce((a, b) => a + b, 0);

  const amountInTxOuts = tx.txOuts
    .map(txOut => txOut.amount)
    .reduce((a, b) => a + b, 0);

  if (amountInTxIns !== amountInTxOuts) {
    console.log(
      `The tx: ${tx} doesn't have the same amount in the txOut as in the txIns`
    );
    return false;
  } else {
    return true;
  }
};

const validateCoinbaseTx = (tx, blockIndex) => {
  if (getTxId(tx) !== tx.id) {
    console.log("Invalid Coinbase tx ID");
    return false;
  } else if (tx.txIns.length !== 1) {
    console.log("Coinbase TX should only have one input");
    return false;
    // 원래 인풋은 레퍼렌싱할 아웃풋이 있는데 코인베이스는 레퍼렌싱할 아웃풋이 없음. 그래서 인덱스를 블록인덱스로
  } else if (tx.txIns[0].txOutIndex !== blockIndex) {
    console.log(
      "The txOutIndex of the Coinbase Tx should be the same as the Block Index"
    );
    return false;
  } else if (tx.txOuts.length !== 1) {
    console.log("Coinbase TX should only have one output");
    return false;
  } else if (tx.txOuts[0].amount !== COINBASE_AMOUNT) {
    console.log(
      `Coinbase TX should have an amount of only ${COINBASE_AMOUNT} and it has ${
        tx.txOuts[0].amount
      }`
    );
    return false;
  } else {
    return true;
  }
};

const createCoinbaseTx = (address, blockIndex) => {
  const tx = new Transaction();
  const txIn = new TxIn();
  txIn.signature = "";
  txIn.txOutId = "";
  txIn.txOutIndex = blockIndex;
  tx.txIns = [txIn];
  tx.txOuts = [new TxOut(address, COINBASE_AMOUNT)];
  tx.id = getTxId(tx);
  return tx;
};

const hasDuplicates = txIns => {
  const groups = _.countBy(txIns, txIn => txIn.txOutId + txIn.txOutIndex);

  return _(groups)
    .map(value => {
      if (value > 1) {
        console.log("Found a duplicated txIn");
        return true;
      } else {
        return false;
      }
    })
    .includes(true);
};

const validateBlockTxs = (txs, uTxOutList, blockIndex) => {
  const coinbaseTx = txs[0];
  if (!validateCoinbaseTx(coinbaseTx, blockIndex)) {
    console.log("Coinbase Tx is invalid");
  }

  const txIns = _(txs)
    .map(tx => tx.txIns)
    .flatten()
    .value();

  if (hasDuplicates(txIns)) {
    console.log("Found duplicated txIns");
    return false;
  }

  const nonCoinbaseTxs = txs.slice(1);

  return nonCoinbaseTxs
    .map(tx => validateTx(tx, uTxOutList))
    .reduce((a, b) => a + b, true);
};

const processTxs = (txs, uTxOutList, blockIndex) => {
  if (!validateBlockTxs(txs, uTxOutList, blockIndex)) {
    return null;
  }
  return updateUTxOuts(txs, uTxOutList);
};

module.exports = {
  getPublicKey,
  getTxId,
  signTxIn,
  TxIn,
  Transaction,
  TxOut,
  createCoinbaseTx,
  processTxs,
  validateTx
};
