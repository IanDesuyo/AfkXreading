// ==UserScript==
// @name         AfkXreading
// @version      0.2.1
// @description  Afk script for xreading.
// @author       IanDesuyo
// @match        https://xreading.com/local/reader/index.php*
// @match        https://xreading.com/blocks/institution/dashboard.php*
// @grant        none
// ==/UserScript==

const wordsPerMinute = 150;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function saveState() {
  const initState = new URLSearchParams(location.search);
  const section =
    document.querySelector(".course-section.active")?.getAttribute("secid") ||
    initState.get("section");

  const signal =
    document.querySelector(".current_active_signal")?.getAttribute("value") ||
    initState.get("signal") ||
    "0";

  const state = {
    data: {
      ...Object.fromEntries(initState),
      section,
      signal,
    },
    lastUpdate: Math.floor(new Date().getTime() / 1000),
  };

  localStorage.setItem("_afkxreading_state", JSON.stringify(state));
}

function continueReadingObserver() {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.attributeName === "class" && mutation.target.classList.contains("show")) {
        console.log("Continue Reading detected, timeout 1s...");
        setTimeout(() => {
          document.querySelector(".continue-reading").click();
          console.log("Continue Reading clicked");
        }, 1000);
      }
    });
  });
  observer.observe(document.querySelector("#popupidletimeout"), { attributes: true });

  return observer;
}

async function getBookStatus() {
  const currentBookId = new URLSearchParams(location.search).get("cid");

  const sesskey = await fetch("https://xreading.com/blocks/institution/mybooks.php?tm=mybooks")
    .then(res => res.text())
    .then(text => /"sesskey":"(.*?)"/gs.exec(text)[1]);

  const resp = await fetch(
    `https://xreading.com/blocks/institution/ajax/request.php?sesskey=${sesskey}&action=mybookdata`
  ).then(res => res.json());

  const books = resp.html.match(/(<tr class="">.*?<\/tr>)+/gs);

  for (let i = 0; i < books.length; i++) {
    const book = books[i];

    const bookReg =
      /<div class="book-shortinfo" cid="(\d+?)">.*?<span.*?class="user-book-title">(.*?)<\/span>.*?<span>Words: (.*?), .*?<td class=".*?creadtime".*?>([\d:]+)<\/td>.*?<td class=".*?creadingspeed".*?>([\d.]+)<\/td>/gs.exec(
        book
      );

    if (bookReg && bookReg[1] === currentBookId) {
      return {
        id: parseInt(bookReg[1]),
        title: bookReg[2],
        totalWords: parseInt(bookReg[3].replace(/,/g, "")),
        currentReadTime: bookReg[4],
        speed: parseFloat(bookReg[5]),
      };
    }
  }
}

(async function () {
  // redirect to reader if user has been redirected to dashboard
  const pathname = location.pathname;
  if (pathname.startsWith("/blocks/institution/dashboard.php")) {
    const current = Math.floor(new Date().getTime() / 1000);
    const state = JSON.parse(localStorage.getItem("_afkxreading_state"));

    // if state is set and last update is less than 3 minutes ago, redirect to the last page
    if (state && current < state.lastUpdate + 180) {
      const { data } = state;

      console.log("Redirecting to last page...");
      location.assign("https://xreading.com/local/reader/index.php?" + new URLSearchParams(data));
    } else {
      console.log("No state found or it's expired.");
      localStorage.removeItem("_afkxreading_state");
    }

    return;
  }

  const observer = continueReadingObserver();
  const bookStatus = await getBookStatus();

  await delay(5000); // wait for the page to load

  const closeButton = document.querySelector(".close-book");

  while (true) {
    // check if the book is finished
    if (closeButton.style.display != "none") {
      console.log("Book finished, removing state...");
      localStorage.removeItem("_afkxreading_state");
      break;
    }

    // save state to prevent the script from stopping
    saveState();

    // calculate the time to wait
    const words = document
      .querySelector(".ajax-content.reader-book-title .activeContent")
      .textContent.split(" ")
      .filter(x => x.length > 0);

    const waitTime = (words.length / wordsPerMinute) * 60;

    console.log(`${words.length} words in this page`);
    console.log(`Waiting ${waitTime} seconds...`);

    await delay(waitTime * 1000);

    document.querySelector(".btn.next-slide").click();
    await delay(5000); // wait for the next page to load
  }
})();
// You can open the continue reading popup by using the following script:
//  $("#popupidletimeout").modal({ backdrop: "static", keyboard: !1 });
