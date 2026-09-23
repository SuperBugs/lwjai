const THEME_KEY = "theme";
const LIGHT = "light";
const DARK = "dark";

/**
 * ★ 默认**亮色**，不跟随系统（2026-09-18 定的）。
 *
 * 读者手动切过就听 localStorage；没切过一律亮色，哪怕系统是深色。
 *
 * ⚠ 这条判据在**三处**，改一处就出事，而且症状各不相同：
 *   ① 这里 —— 运行时的初始值
 *   ② `src/layouts/Layout.astro` 的内联 FOUC 脚本 —— **首屏那一帧**的颜色。
 *      和这里不一致的表现是：页面先闪一个颜色再跳成另一个。
 *   ③ 本文件底部原来有一个 `prefers-color-scheme` 的 change 监听，它会在系统主题
 *      变化时**改值并 persist**。留着它的话，读者把系统切到深色，站就跟着变深
 *      并写进 localStorage —— "默认亮色"被静默覆盖，而且从此回不去。已删。
 */
function getPreferredTheme(): string {
  return localStorage.getItem(THEME_KEY) ?? LIGHT;
}

// Reuse the value already set by the inline FOUC-prevention script if available.
let themeValue: string =
  (window as unknown as { __theme?: { value: string } }).__theme?.value ??
  getPreferredTheme();

function persist(): void {
  localStorage.setItem(THEME_KEY, themeValue);
  reflect();
}

function reflect(): void {
  const root = document.firstElementChild;
  root?.setAttribute("data-theme", themeValue);
  root?.classList.toggle("dark", themeValue === DARK);
  document.querySelector("#theme-btn")?.setAttribute("aria-label", themeValue);

  // Fill <meta name="theme-color"> with the computed background colour so
  // Android's browser chrome matches the page background.
  const bg = window.getComputedStyle(document.body).backgroundColor;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bg);
}

function setup(): void {
  reflect();
  document.querySelector("#theme-btn")?.addEventListener("click", () => {
    themeValue = themeValue === LIGHT ? DARK : LIGHT;
    persist();
  });
}

setup();

// Re-run after View Transitions navigation.
document.addEventListener("astro:after-swap", setup);

// Carry the theme-color value across View Transitions to prevent the
// Android navigation bar from flashing during page transitions.
document.addEventListener("astro:before-swap", event => {
  const color = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");
  if (color) {
    (event as { newDocument: Document }).newDocument
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", color);
  }
});

// ★ 这里原来有一个 `prefers-color-scheme` 的 change 监听，跟随系统主题切换并 persist。
//   改成"默认亮色"之后它必须一起删 —— 见 getPreferredTheme() 上面那段第 ③ 条。
//   留着的话读者切一下系统主题，站的默认值就被静默改写了。
