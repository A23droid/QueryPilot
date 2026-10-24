import chalk from "chalk";

/**
 * Beautiful Chalk-based terminal Markdown formatter.
 *
 * Transforms raw Markdown into a rich CLI experience:
 * - Normalizes Windows CRLF line endings
 * - Renders clean ASCII/Unicode box-drawing tables with aligned columns
 * - Styles headers with colored accents and dividers
 * - Formats blockquotes with stylish vertical bars
 * - Colors code blocks, inline tags, status badges, and bullet points
 */
export function renderTerminalMarkdown(content: string): string {
  if (!content) return "";

  // 1. Normalize line endings to avoid Windows CRLF regex issues
  let text = content.replace(/\r\n/g, "\n");

  // 2. Format Markdown Tables into aligned, border-boxed terminal tables
  const tableRegex = /((?:^[ \t]*\|.+\|[ \t]*\n)+)/gm;
  text = text.replace(tableRegex, (match) => {
    const rawLines = match.trim().split("\n");
    if (rawLines.length < 2) return match;

    // Filter out separator lines (|---|---|)
    const dataLines = rawLines.filter((l) => !/^[ \t]*\|[ \t]*[-:]+/.test(l));
    if (dataLines.length === 0) return match;

    const parsedRows = dataLines.map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    );

    const colCount = Math.max(...parsedRows.map((r) => r.length));
    const colWidths: number[] = new Array(colCount).fill(0);

    // Calculate maximum visual width per column (stripping markdown backticks/stars for width calculation)
    parsedRows.forEach((row) => {
      row.forEach((cell, i) => {
        const plain = cell.replace(/[`*_]/g, "");
        colWidths[i] = Math.max(colWidths[i] || 0, plain.length);
      });
    });

    const isHeader = rawLines[1] && /^[ \t]*\|[ \t]*[-:]+/.test(rawLines[1]);
    const formatted: string[] = [];

    // Table Top Border
    formatted.push(
      chalk.dim(
        "  ┌─" + colWidths.map((w) => "─".repeat(w)).join("─┬─") + "─┐",
      ),
    );

    parsedRows.forEach((row, rowIdx) => {
      const cells = row.map((cell, i) => {
        const width = colWidths[i] || 10;
        const plain = cell.replace(/[`*_]/g, "");
        const pad = " ".repeat(Math.max(0, width - plain.length));

        // Format cell content
        let formattedCell = cell;
        if (cell.includes("CRITICAL") || cell.includes("REGRESSION")) {
          formattedCell = chalk.red.bold(cell);
        } else if (cell.includes("OPTIMIZED") || cell.includes("IMPROVEMENT") || cell.includes("PASS")) {
          formattedCell = chalk.green.bold(cell);
        } else if (cell.includes("WARNING")) {
          formattedCell = chalk.yellow.bold(cell);
        } else if (cell.startsWith("`") && cell.endsWith("`")) {
          formattedCell = chalk.yellowBright(cell.replace(/`/g, ""));
        } else if (cell.startsWith("**") && cell.endsWith("**")) {
          formattedCell = chalk.bold(cell.replace(/\*\*/g, ""));
        }

        if (rowIdx === 0 && isHeader) {
          return chalk.cyan.bold(plain) + pad;
        }
        return formattedCell + pad;
      });

      formatted.push("  │ " + cells.join(" │ ") + " │");

      // Divider below header row
      if (rowIdx === 0 && isHeader) {
        formatted.push(
          chalk.dim(
            "  ├─" + colWidths.map((w) => "─".repeat(w)).join("─┼─") + "─┤",
          ),
        );
      }
    });

    // Table Bottom Border
    formatted.push(
      chalk.dim(
        "  └─" + colWidths.map((w) => "─".repeat(w)).join("─┴─") + "─┘",
      ),
    );

    return "\n" + formatted.join("\n") + "\n";
  });

  // 3. Format SQL and Code Blocks
  text = text.replace(/```(?:sql|text|bash)?\s*([\s\S]*?)```/g, (match, code) => {
    const lines = code
      .trim()
      .split("\n")
      .map((l: string) => `  ${chalk.green(l)}`);
    const border = chalk.dim("  " + "─".repeat(55));
    return `\n${border}\n${lines.join("\n")}\n${border}\n`;
  });

  // 4. Format Blockquotes (> Quote)
  text = text.replace(/^[ \t]*>[ \t]*(.*)$/gm, (match, quote) => {
    return chalk.dim("  │ ") + chalk.italic(quote);
  });

  // 5. Format Headers
  text = text.replace(/^###\s*(.+)$/gm, (m, h) => `\n${chalk.cyan.bold("■ " + h)}`);
  text = text.replace(
    /^##\s*(.+)$/gm,
    (m, h) => `\n${chalk.bold.underline(h)}\n`,
  );
  text = text.replace(
    /^#\s*(.+)$/gm,
    (m, h) => `\n${chalk.bgCyan.black(" " + h + " ")}\n`,
  );

  // 6. Inline Styles
  text = text.replace(/\*\*(.*?)\*\*/g, (m, b) => chalk.bold(b));
  text = text.replace(/\*(.*?)\*/g, (m, i) => chalk.italic(i));
  text = text.replace(/`([^`]+)`/g, (m, c) => chalk.yellowBright(c));

  // 7. Bullet Points
  text = text.replace(/^\s*[-*]\s+/gm, `  ${chalk.cyan("•")} `);

  // 8. Horizontal Rules
  text = text.replace(/^---$/gm, chalk.dim("─".repeat(60)));

  return text.trim();
}
