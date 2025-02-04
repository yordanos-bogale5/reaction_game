import { io, Socket } from "socket.io-client";
import {
  ClientToServerEvents,
  gameDataInterface,
  ServerToClientEvents,
} from "../../shared/types/SocketTypes";
import "./assets/scss/style.scss";
import { ScoreData } from "./types";
import elements from "./elements";

const SOCKET_HOST = import.meta.env.VITE_SOCKET_HOST;
const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
  io(SOCKET_HOST);

const displayScores = (data: ScoreData[], target: HTMLElement | null) => {
  if (!target) {
    console.error("Target div not found");
    return;
  }

  data.forEach((item: ScoreData) => {
    const scoreDiv: HTMLDivElement = document.createElement("div");
    scoreDiv.classList.add("score-entry");

    const { id, scores } = item;
    const player1 = scores.player1;
    const player2 = scores.player2;

    scoreDiv.innerHTML = `
          <div>
              <h4>Player 1:</h4>
              <p>Name: ${player1.name}</p>
              <p>Total Time: ${player1.total_time.total_time} s</p>
          </div>
          <div>
              <h4>Player 2:</h4>
              <p>Name: ${player2.name}</p>
              <p>Total Time: ${player2.total_time.total_time} s</p>
          </div>
      `;

    target.appendChild(scoreDiv);
  });
};

let virusAppearTime: number | null = null;
let virusClickCount = 0;
const totalRounds = 10;
let time = 30;
let timeInterval: number;
let userId: string | null = null;
let hasClickedCurrentRound = false;

const initializeSocketListeners = () => {
  socket.on("connect", () =>
    console.log("Connected to the server", SOCKET_HOST)
  );
  socket.on("disconnect", () =>
    console.log("Disconnected from the server:", SOCKET_HOST)
  );
  socket.io.on("reconnect", () =>
    console.log("Reconnected to the server:", SOCKET_HOST)
  );
  socket.on("gameStarting", onGameStarting);
  socket.on("virusPosition", displayVirus);
  socket.on("onGameInformationUpdated", updateGameInfo);
  socket.on("userId", (data) => (userId = data));
  socket.on("showHighestScores", ({ last10Matches, highestScorer }) => {
    removeVirus();
    elements.userForm?.classList.add("d-none");
    elements.canvas?.classList.add("d-none");
    elements.gameResults?.classList.remove("d-none");
    elements.last10GamesTitle?.classList.remove("d-none");
    elements.fastestPlayer!.innerHTML = `Highest Scorer is ${highestScorer.name} with Average time of ${highestScorer.averageReactionTime}`;
    elements.fastestPlayer?.classList.remove("d-none");
    displayScores(last10Matches, elements.last10GamesResults);
  });
};

const registerUser = () => {
  if (elements.userForm && elements.usernameInput) {
    elements.userForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = elements.usernameInput?.value.trim();
      if (!username) return;

      socket.emit("registerUser", { username });
      setupGameUI();
    });
  } else {
    console.error("userForm or usernameInput not found");
  }
};

const setupGameUI = () => {
  elements.canvas?.classList.remove("d-none");
  elements.userForm?.classList.add("d-none");
  elements.usernameInput?.classList.add("d-none");
  elements.waitingLobby!.innerHTML = "<p>Waiting for another player...</p>";
  elements.waitingLobby?.classList.remove("d-none");
  elements.startView?.classList.add("d-none");
  elements.canvasParent?.classList.add("d-none");
};

const onGameStarting = ({ opponentName }: { opponentName: string }) => {
  elements.waitingLobby?.classList.add("d-none");
  elements.gameOn?.classList.remove("d-none");
  elements.canvasParent?.classList.remove("d-none");
  elements.oppName!.innerText = opponentName;
  startTimer();
};

const startTimer = () => {
  timeInterval = setInterval(() => {
    time--;
    if (time <= 0) {
      if (!hasClickedCurrentRound) {
        socket.emit("virusClicked", {
          reactionTime: 30,
          iteration: virusClickCount,
          userId: userId as string,
        });
      }
      startNewRound();
    }
  }, 1000) as unknown as number;
};

const startNewRound = () => {
  if (virusClickCount >= totalRounds) {
    endGame();
    return;
  }
  
  clearInterval(timeInterval);
  time = 30;
  startTimer();
};

const displayVirus = (position: { x: number; y: number }) => {
  removeVirus();
  const virusImage = document.createElement("img");
  virusImage.src =
    "https://media.istockphoto.com/id/1213234441/vector/corona-virus-bacteria-cartoon-character.jpg?s=612x612&w=0&k=20&c=zFI_la-h6V9yGo-4XHwsET-BiQKjI1YB5V4qd4JDsck=";
  virusImage.classList.add("virus-image");
  virusImage.style.left = `${position.x}px`;
  virusImage.style.top = `${position.y}px`;
  virusImage.onclick = () => onVirusClick(virusImage);
  elements.canvas?.appendChild(virusImage);
  virusAppearTime = Date.now();
};

const removeVirus = () => {
  document.querySelector(".virus-image")?.remove();
};

const onVirusClick = (virusImage: HTMLImageElement) => {
  if (hasClickedCurrentRound) return;
  
  if (virusAppearTime === null) return;

  hasClickedCurrentRound = true;
  const reactionTimeSec = calculateReactionTime();
  
  socket.emit("virusClicked", {
    reactionTime: reactionTimeSec,
    iteration: virusClickCount,
    userId: userId as string,
  });

  virusImage.style.display = 'none';
  updateIteration(reactionTimeSec);
};

const calculateReactionTime = () => {
  if (virusAppearTime === null) return 0;
  const reactionTimeMs = Date.now() - virusAppearTime;
  return parseFloat((reactionTimeMs / 1000).toFixed(3));
};

const updateIteration = (reactionTimeSec: number) => {
  if (elements.myIteration)
    elements.myIteration.innerText = virusClickCount.toString();
  if (elements.myTime) elements.myTime.innerText = `${reactionTimeSec}` + " s";
};

const endGame = () => {
  clearInterval(timeInterval);
  removeVirus();
  elements.canvas?.classList.add("d-none");
  elements.gameResults?.classList.remove("d-none");
  displayGameResult();
};

const displayGameResult = () => {
  const myTimeFinal = Number(elements.myTotalTime?.innerText || 0);
  const oppTimeFinal = Number(elements.oppTotalTime?.innerText || 0);
  
  let resultMessage: string;
  
  if (oppTimeFinal === 0) {
    resultMessage = "You Won (opponent disconnected)";
  } else if (myTimeFinal < oppTimeFinal) {
    resultMessage = "You Won! Fastest Reaction Time!";
  } else if (myTimeFinal > oppTimeFinal) {
    resultMessage = "You Lost - Better Luck Next Time";
  } else {
    resultMessage = "It's a Tie!";
  }

  if (elements.gameResults) {
    elements.gameResults.innerHTML = `
      <h2>${resultMessage}</h2>
      <p>Your Total Time: ${myTimeFinal.toFixed(3)}s</p>
      <p>Opponent's Total Time: ${oppTimeFinal.toFixed(3)}s</p>
    `;
  }
  
  socket.emit("saveData");
};

const updateGameInfo = (data: gameDataInterface) => {
  if (elements.oppTime) elements.oppTime.innerText = `${data.opp_time}` + " s" || "";
  if (elements.oppTotalTime) elements.oppTotalTime.innerText = data.opp_total_time;
  if (elements.myTime) elements.myTime.innerText = data.my_time;
  
  if (data.opponentIteration) {
    virusClickCount = data.opponentIteration;
    if (elements.oppIteration) {
      elements.oppIteration.innerText = data.opponentIteration.toString();
    }
    hasClickedCurrentRound = false;
    startNewRound();
  }
};

initializeSocketListeners();
registerUser();
