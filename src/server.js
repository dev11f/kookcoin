const express = require("express"),
  bodyParser = require("body-parser"),
  morgan = require("morgan"),
  Blockchain = require("./blockchain"),
  P2P = require("./p2p"),
  _ = require("lodash"),
  cors = require("cors"),
  Mempool = require("./mempool"),
  Wallet = require("./wallet");

const {
  getBlockchain,
  createNewBlock,
  getAccountBalance,
  sendTx,
  getUTxOutList
} = Blockchain;
const { startP2PServer, connectToPeers } = P2P;
const { initWallet, getPublicFromWallet, getBalance } = Wallet;
const { getMempool } = Mempool;

// PORT라는 이름의 환경변수를 찾고 없으면 3000
const PORT = process.env.HTTP_PORT || 3000;

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(morgan("combined"));

app
  .route("/blocks")
  .get((req, res) => {
    res.send(getBlockchain());
  })
  .post((req, res) => {
    const newBlock = createNewBlock();
    res.send(newBlock);
  });

app.post("/peers", (req, res) => {
  const {
    body: { peer }
  } = req;
  connectToPeers(peer);
  res.send();
});

app.get("/me/balance", (req, res) => {
  const balance = getAccountBalance();
  res.send({ balance });
});

app.get("/me/address", (req, res) => {
  res.send(getPublicFromWallet());
});

app.get("/blocks/:hash", (req, res) => {
  const {
    params: { hash }
  } = req;
  const block = _.find(getBlockchain(), { hash });
  if (block === undefined) {
    res.status(400).send("Block not found");
  } else {
    res.send(block);
  }
});

app.get("/transactions/:id", (req, res) => {
  const tx = _(getBlockchain())
    .map(blocks => blocks.data)
    .flatten()
    .find({ id: req.params.id });
  if (tx === undefined) {
    res.status(400).send("Transaction not found");
  }
  res.send(tx);
});

app
  .route("/transactions")
  .get((req, res) => {
    res.send(getMempool());
  })
  .post((req, res) => {
    try {
      const {
        body: { address, amount }
      } = req;
      if (address === undefined || amount === undefined) {
        throw Error("Please specify and address and an amount");
      } else {
        const resPonse = sendTx(address, amount);
        res.send(resPonse);
      }
    } catch (e) {
      res.status(400).send(e.message);
    }
  });

app.get("/address/:address", (req, res) => {
  const {
    params: { address }
  } = req;
  const balance = getBalance(address, getUTxOutList());
  res.send({ balance });
});

const server = app.listen(PORT, () =>
  console.log(`Kookcoin Server running on ${PORT} ✅`)
);
// 원래 이거였는데 p2p server에 넘겨야하기 때문에 변수 할당해줌
// app.listen(PORT, () => console.log(`Kookcoin Server running on ${PORT} ✅`));

initWallet();
startP2PServer(server);
