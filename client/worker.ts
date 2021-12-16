import init, { initThreadPool } from "ecdsa-wasm";
import { makeWebSocketClient, BroadcastMessage } from "./websocket-client";
import { PeerState, KeygenResult, Handshake } from "./machine-common";
import { makeKeygenStateMachine } from "./machine-keygen";
import { makeSignMessageStateMachine } from "./machine-sign";

// Temporary hack for getRandomValues() error
const getRandomValues = crypto.getRandomValues;
crypto.getRandomValues = function <T extends ArrayBufferView | null>(
  array: T
): T {
  const buffer = new Uint8Array(array as unknown as Uint8Array);
  const value = getRandomValues.call(crypto, buffer);
  (array as unknown as Uint8Array).set(value);
  return array;
};

// For top-level await typescript wants `target` to be es2017
// but this generates a "too much recursion" runtime error so
// we avoid top-level await for now
void (async function () {
  await init();
  await initThreadPool(navigator.hardwareConcurrency);
})();

const url = "ws://localhost:3030/demo";
const { send, request } = makeWebSocketClient({
  url,
  onOpen: async () => {
    postMessage({ type: "connected", url });
    const handshake = (await getKeygenHandshake()) as Handshake;
    postMessage({
      type: "ready",
      ...handshake.parameters,
      ...handshake.client,
    });
  },
  onClose: async () => {
    postMessage({ type: "disconnected" });
  },
  onBroadcastMessage,
});

let peerState: PeerState = { parties: 0, received: [] };
let keygenResult: KeygenResult = null;

const keygenMachine = makeKeygenStateMachine(
  peerState,
  request,
  postMessage,
  onKeygenResult
);
const signMachine = makeSignMessageStateMachine(
  peerState,
  request,
  postMessage,
  send
);

// Receive messages sent to the worker from the ui
self.onmessage = async (e) => {
  const { data } = e;
  if (data.type === "party_signup") {
    await keygenMachine.machine.next();
  } else if (data.type === "sign_proposal") {
    const { message } = data;
    send({ kind: "sign_proposal", data: { message } });
  } else if (data.type === "sign_message") {
    const { message } = data;
    await signMachine.machine.next({ message, keygenResult });
  }
};

// wapper for late binding of keygenMachine
async function getKeygenHandshake() {
  return await keygenMachine.machine.next();
}

// Handle messages from the server that were broadcast
// without a client request
async function onBroadcastMessage(msg: BroadcastMessage) {
  if (await keygenMachine.onBroadcastMessage(msg)) return true;
  if (await signMachine.onBroadcastMessage(msg)) return true;
  return false;
}

// get result out of keygen state machine
function onKeygenResult(result: KeygenResult) {
  keygenResult = result;
}
