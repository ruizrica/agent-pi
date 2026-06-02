const greeting = document.getElementById("greeting");
const btn = document.getElementById("btn");
let count = 0;

btn.addEventListener("click", () => {
  count += 1;
  greeting.textContent = count === 1 ? "Hello again!" : `Hello again! (${count}x)`;
});
