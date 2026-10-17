import chalk from "chalk";

/**
 * Clean terminal formatter that converts Markdown into beautiful, readable CLI output.
 * - Converts raw markdown tables into bullet cards (avoiding broken column wrapping)
 * - Properly handles **bold** and *italic*
 * - Formats headers with colors and dividers
 * - Boxes and colors SQL code blocks
 */
export function renderTerminalMarkdown(content: string): string {
  if (!content) return "";

  // 1. Convert markdown tables into clean bulleted cards
  const tableRegex = /\|(.+)\|\n\|[-:| ]+\|\n((?:\|.+\|\n?)+)/g;
  let text = content.replace(tableRegex, (match, headerRow, bodyRows) => {
    const headers = headerRow
      .split("|")
      .map((h: string) => h.trim())
      .filter(Boolean);

    const rows = bodyRows
      .trim()
      .split("\n")
      .map((r: string) =>
        r
          .split("|")
          .map((c: string) => c.trim())
          .filter(Boolean),
      );

    const cards = rows.map((row: string[]) => {
      return row
        .map((val: string, i: number) => {
          const label = headers[i] || `Field ${i + 1}`;
          if (i === 0) {
            return `\n  ${chalk.cyan.bold("•")} ${chalk.bold(val)}`;
          }
          return `    ${chalk.dim(label + ":")} ${val}`;
        })
        .join("\n");
    });

    return cards.join("\n") + "\n";
  });

  // 2. Format SQL code blocks with styled borders
  text = text.replace(/```(?:sql)?\s*([\s\S]*?)```/g, (match, code) => {
    const lines = code
      .trim()
      .split("\n")
      .map((l: string) => `  ${chalk.green(l)}`);
    const border = chalk.dim("  " + "─".repeat(50));
    return `\n${border}\n${lines.join("\n")}\n${border}\n`;
  });

  // 3. Format Headers
  text = text.replace(/^###\s*(.+)$/gm, (m, h) => `\n${chalk.cyan.bold(h)}`);
  text = text.replace(
    /^##\s*(.+)$/gm,
    (m, h) => `\n${chalk.bold.underline(h)}\n`,
  );
  text = text.replace(
    /^#\s*(.+)$/gm,
    (m, h) => `\n${chalk.bgCyan.black(" " + h + " ")}\n`,
  );

  // 4. Handle **bold** and *italic*
  text = text.replace(/\*\*(.*?)\*\*/g, (m, b) => chalk.bold(b));
  text = text.replace(/\*(.*?)\*/g, (m, i) => chalk.italic(i));

  // 5. Handle inline code `code`
  text = text.replace(/`([^`]+)`/g, (m, c) => chalk.yellowBright(c));

  // 6. Handle bullet points
  text = text.replace(/^\s*[-*]\s+/gm, `  ${chalk.cyan("•")} `);

  // 7. Handle horizontal rules
  text = text.replace(/^---$/gm, chalk.dim("─".repeat(50)));

  return text.trim();
}
