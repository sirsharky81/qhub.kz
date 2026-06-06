import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  BorderStyle,
  TableRow,
  TableCell,
  Table,
  WidthType,
} from "docx";
import { saveAs } from "file-saver";
import { Recipe, DIFFICULTY_LABELS } from "./types";

function buildRecipeDoc(recipe: Recipe): Document {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: recipe.title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: recipe.description, italics: true, color: "555555" }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Кухня", bold: true })] })],
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: recipe.cuisine })],
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Категория", bold: true })] })],
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: recipe.category })],
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Время", bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ text: `${recipe.cookingTime} мин` })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Сложность", bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ text: DIFFICULTY_LABELS[recipe.difficulty] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Калории", bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ text: `${recipe.calories} ккал/порц.` })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Порций", bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ text: `${recipe.servings}` })],
          }),
        ],
      }),
    ],
  });

  children.push(new Paragraph({ children: [], spacing: { after: 100 } }));

  children.push(
    new Paragraph({
      text: "Ингредиенты",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
    })
  );

  recipe.ingredients.forEach((ing) => {
    children.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [
          new TextRun({ text: ing.name, bold: true }),
          new TextRun({ text: ` — ${ing.amount}` }),
        ],
        spacing: { after: 60 },
      })
    );
  });

  children.push(
    new Paragraph({
      text: "Приготовление",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
    })
  );

  recipe.steps.forEach((step, i) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${i + 1}. `, bold: true }),
          new TextRun({ text: step }),
        ],
        spacing: { after: 120 },
      })
    );
  });

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Создано с помощью QHub.kz — Что приготовить?",
          color: "999999",
          italics: true,
          size: 18,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
    })
  );

  return new Document({
    sections: [
      {
        children: [infoTable, ...children],
      },
    ],
  });
}

export async function exportRecipeToWord(recipe: Recipe): Promise<void> {
  const doc = buildRecipeDoc(recipe);
  const blob = await Packer.toBlob(doc);
  const filename = `${recipe.title.replace(/[^а-яёА-ЯЁa-zA-Z0-9\s]/g, "").trim()}.docx`;
  saveAs(blob, filename);
}

export function printRecipe(recipe: Recipe): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const ingredientsList = recipe.ingredients
    .map((ing) => `<li><strong>${ing.name}</strong> — ${ing.amount}</li>`)
    .join("");

  const stepsList = recipe.steps
    .map((step, i) => `<li><strong>${i + 1}.</strong> ${step}</li>`)
    .join("");

  const difficultyMap: Record<string, string> = {
    easy: "Легко",
    medium: "Средне",
    hard: "Сложно",
  };

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>${recipe.title}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #111; }
        h1 { font-size: 28px; margin-bottom: 6px; }
        .subtitle { color: #555; font-style: italic; margin-bottom: 20px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8f8f8; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
        .meta-item { display: flex; flex-direction: column; }
        .meta-label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.05em; }
        .meta-value { font-size: 16px; font-weight: 600; }
        h2 { font-size: 18px; border-bottom: 2px solid #eee; padding-bottom: 6px; margin-top: 28px; }
        ul, ol { padding-left: 20px; }
        li { margin-bottom: 6px; line-height: 1.5; }
        .footer { margin-top: 40px; text-align: center; color: #aaa; font-size: 12px; border-top: 1px solid #eee; padding-top: 16px; }
        @media print { body { margin: 20px; } }
      </style>
    </head>
    <body>
      <h1>${recipe.title}</h1>
      <p class="subtitle">${recipe.description}</p>
      <div class="meta">
        <div class="meta-item"><span class="meta-label">Кухня</span><span class="meta-value">${recipe.cuisine}</span></div>
        <div class="meta-item"><span class="meta-label">Категория</span><span class="meta-value">${recipe.category}</span></div>
        <div class="meta-item"><span class="meta-label">Время</span><span class="meta-value">${recipe.cookingTime} мин</span></div>
        <div class="meta-item"><span class="meta-label">Сложность</span><span class="meta-value">${difficultyMap[recipe.difficulty] || recipe.difficulty}</span></div>
        <div class="meta-item"><span class="meta-label">Калории</span><span class="meta-value">${recipe.calories} ккал/порц.</span></div>
        <div class="meta-item"><span class="meta-label">Порций</span><span class="meta-value">${recipe.servings}</span></div>
      </div>
      <h2>Ингредиенты</h2>
      <ul>${ingredientsList}</ul>
      <h2>Приготовление</h2>
      <ol>${stepsList}</ol>
      <div class="footer">Создано с помощью QHub.kz — Что приготовить?</div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}
