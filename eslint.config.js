import eslintPluginAstro from "eslint-plugin-astro";
import tsParser from "@typescript-eslint/parser";

export default [
  ...eslintPluginAstro.configs.recommended,
  {
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
    },
  },
  { rules: { "no-console": "error" } },
  {
    /**
     * `scripts/` 下的东西是**命令行工具**：发布闸（scripts/gate/）和批量清理
     * （scripts/content/）的产出物就是屏幕上那份报告，`console` 是它们的输出接口，
     * 不是漏下的调试语句。
     *
     * 【2026-09-18】在这条之前 `pnpm lint` 是**红的** —— 31 个 error 全部是
     * scripts/gate/ 里的 no-console，从建站起就一直红着。一条永远红的 lint
     * 等于没有 lint：真有新问题混进来时，它藏在一屏已经被无视掉的报错里。
     */
    files: ["scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
  /**
   * 生成物。⚠【2026-09-22 踩到】`.wrangler/**` 是当天补的：本地跑一次
   * `wrangler dev`（docs/deploy.md 2.6 里那条"发之前先确认 /sitemap.xml 返回 XML"
   * 的验证办法）就会留下 `.wrangler/tmp/dev-<随机串>/no-op-worker.js`
   * （⚠ 这个路径里的通配符不许按原样写进块注释 —— 星号紧跟斜杠会**当场把注释关掉**，
   * 于是下面几行变成代码、`pnpm lint` 直接报语法错。实测于本条注释本身），里面有一句
   * `console.log` —— 于是 `pnpm lint` 从此是**红的**，而红的是 wrangler 自己
   * 生成的一个临时文件。它已经在 .gitignore 里，漏的只有这一份名单。
   * 理由和上面那条 scripts/ 的 no-console 同一条：一条永远红的 lint 等于没有 lint。
   */
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "public/pagefind/**",
      ".wrangler/**",
      // 嵌在这里的开源镜像工作副本（.gitignore 里有理由）：flat config 不读 .gitignore。
      "open_source/**",
    ],
  },
];
