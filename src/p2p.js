const WebSockets = require("ws"),
  Mempool = require("./mempool"),
  Blockchain = require("./blockchain");

const {
  getNewestBlock,
  isBlockStructureValid,
  addBlockToChain,
  replaceChain,
  getBlockchain,
  handleIncomingTx
} = Blockchain;
const { getMempool } = Mempool;
const sockets = [];

// Messages Types
const GET_LATEST = "GET_LATEST";
const GET_ALL = "GET_ALL";
const BLOCKCHAIN_RESPONSE = "BLOCKCHAIN_RESPONSE";
const REQUEST_MEMPOOL = "REQUEST_MEMPOOL";
const MEMPOOL_RESPONSE = "MEMPOOL_RESPONSE";

// Message Creators
const getLatest = () => {
  return {
    type: GET_LATEST,
    data: null
  };
};

const getAll = () => {
  return {
    type: GET_ALL,
    data: null
  };
};

const blockchainResponse = data => {
  return {
    type: BLOCKCHAIN_RESPONSE,
    data
  };
};

const getAllMempool = () => {
  return {
    type: REQUEST_MEMPOOL,
    data: null
  };
};

const mempoolResponse = data => {
  return {
    type: MEMPOOL_RESPONSE,
    data
  };
};

const getSockets = () => sockets;

// Socket은 HTTP와 꽤 다르다. p2p server는 같은 포트에서 실행될 수 있다. 프로토콜이 달라서.
// HTTP는 그게 안되나봄
const startP2PServer = server => {
  const wsServer = new WebSockets.Server({ server });
  wsServer.on("connection", ws => {
    initSocketConnection(ws);
    console.log(`Hello Socket`);
  });
  wsServer.on("error", () => {
    console.log("error");
  });
  console.log("Kookcoin P2P Server Running");
};

const initSocketConnection = ws => {
  sockets.push(ws);
  handleSocketMessages(ws);
  handleSocketError(ws);
  sendMessage(ws, getLatest());
  // 체인 싱크 먼저 하고 mempool을 원함
  setTimeout(() => {
    sendMessageToAll(getAllMempool());
  }, 1000);

  // 오랫동안 메세지를 안보내면 소켓 연결이 끊길 수 있기 때문에 주기적으로 보냄
  setInterval(() => {
    if (sockets.includes(ws)) {
      sendMessage(ws, "");
    }
  }, 1000);
};

const parseData = data => {
  try {
    // data를 JSON으로 바꾸기
    return JSON.parse(data);
  } catch (e) {
    console.log(e);
    return null;
  }
};

const handleSocketMessages = ws => {
  ws.on("message", data => {
    const message = parseData(data);
    if (message === null) {
      return;
    }
    switch (message.type) {
      case GET_LATEST:
        sendMessage(ws, responseLatest());
        break;
      case GET_ALL:
        sendMessage(ws, responseAll());
        break;
      case BLOCKCHAIN_RESPONSE:
        const receivedBlocks = message.data;
        if (receivedBlocks === null) {
          break;
        }
        handleBlockchainResponse(receivedBlocks);
        break;
      case REQUEST_MEMPOOL:
        sendMessage(ws, returnMempool());
        break;
      case MEMPOOL_RESPONSE:
        const receivedTxs = message.data;
        if (receivedTxs === null) {
          return;
        }
        receivedTxs.forEach(tx => {
          try {
            handleIncomingTx(tx);
          } catch (e) {
            console.log(e);
          }
        });
        break;
    }
  });
};

const handleBlockchainResponse = receivedBlocks => {
  if (receivedBlocks.length === 0) {
    console.log("Received blocks have a length of 0");
    return;
  }

  const lastestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
  if (!isBlockStructureValid(lastestBlockReceived)) {
    console.log("The block structure of the block received is not valid");
    return;
  }

  const newestBlock = getNewestBlock();
  if (lastestBlockReceived.index > newestBlock.index) {
    // 우리보다 앞선 블록을 받은 경우.
    // 블록 차이가 하나 나는지, 많이 나는지 체크
    if (newestBlock.hash === lastestBlockReceived.previousHash) {
      if (addBlockToChain(lastestBlockReceived)) {
        broadcastNewBlock();
      }
    } else if (receivedBlocks.length === 1) {
      // to do, get all the blocks, we are waaaay behind
      sendMessageToAll(getAll());
    } else {
      replaceChain(receivedBlocks);
    }
  }
};

const returnMempool = () => mempoolResponse(getMempool());

const sendMessage = (ws, message) => ws.send(JSON.stringify(message));

const sendMessageToAll = message =>
  sockets.forEach(ws => sendMessage(ws, message));

const responseLatest = () => blockchainResponse([getNewestBlock()]);

const responseAll = () => blockchainResponse(getBlockchain());

const broadcastNewBlock = () => sendMessageToAll(responseLatest());

const broadcastMempool = () => sendMessageToAll(returnMempool());

const handleSocketError = ws => {
  const closeSocketConnection = ws => {
    ws.close();
    sockets.splice(sockets.indexOf(ws), 1);
  };
  ws.on("close", () => closeSocketConnection(ws));
  ws.on("error", () => closeSocketConnection(ws));
};

const connectToPeers = newPeer => {
  const ws = new WebSockets(newPeer);
  ws.on("open", () => {
    // 커넥션을 열 때 소켓 연결을 실행
    initSocketConnection(ws);
  });
  // nodejs는 민감해서 에러나면 app crashed 됐다고 꺼짐. 그래서 오류 핸들 잘해줘야 함
  ws.on("error", () => console.log("Connection failed"));
  ws.on("close", () => console.log("Connection failed"));
};

module.exports = {
  startP2PServer,
  connectToPeers,
  broadcastNewBlock,
  broadcastMempool
};
