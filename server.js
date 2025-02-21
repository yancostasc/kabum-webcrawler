const puppeteer = require("puppeteer");
const express = require("express");

const app = express();
const PORT = 5000;

app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Parâmetro de busca necessário" });
  }

  const searchTerms = query.split(",").map((term) => term.trim());
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  let allResults = [];

  try {
    for (const term of searchTerms) {
      const url = `https://www.kabum.com.br/busca/${encodeURIComponent(term)}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      await page.waitForSelector(".productCard");

      const products = await page.evaluate((searchTerm) => {
        const items = document.querySelectorAll(".productCard");

        let results = Array.from(items)
          .filter((item) => !item.innerText.includes("PATROCINADO"))
          .map((item) => {
            const name =
              item.querySelector(".nameCard")?.innerText.trim() ||
              "Nome não encontrado";
            const price =
              item.querySelector(".priceCard")?.innerText.trim() ||
              "Preço não ";
            const image =
              item.querySelector("img")?.getAttribute("src") ||
              "Imagem não encontrada";
            const link =
              item.querySelector("a")?.getAttribute("href") || "URL não asd";

            const reviewElement = item.querySelector(
              ".ratingStarsContainer + span"
            );
            const reviewCount = reviewElement
              ? reviewElement.innerText.replace(/[()]/g, "").trim()
              : "0";

            const ratingElement = item.querySelector(".ratingStarsContainer");
            const ratingText = ratingElement?.getAttribute("aria-label") || "";
            const ratingMatch = ratingText.match(/(\d+) de 5 estrelas/);
            const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;

            return {
              searchTerm,
              name,
              price,
              reviewCount,
              rating,
              image,
              url: link.startsWith("/")
                ? `https://www.kabum.com.br${link}`
                : link,
            };
          });

        return results;
      }, term);

      allResults.push(...products);
    }

    await browser.close();
    res.json(allResults);
  } catch (error) {
    await browser.close();
    res
      .status(500)
      .json({ error: "Erro ao buscar produtos", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
