const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const express = require("express");
const NodeCache = require("node-cache");

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 5000;
const cache = new NodeCache({ stdTTL: 300 });

app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Parâmetro de busca necessário" });
  }

  if (cache.has(query)) {
    return res.json(cache.get(query));
  }

  const searchTerms = query.split(",").map((term) => term.trim());
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

  let allResults = {};

  try {
    for (const term of searchTerms) {
      try {
        const url = `https://www.kabum.com.br/busca/${encodeURIComponent(term)}`;
        console.log(`Buscando: ${url}`);
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        await page.waitForSelector(".productCard", { timeout: 10000 });

        const products = await page.evaluate((searchTerm) => {
          const items = document.querySelectorAll(".productCard");

          return Array.from(items)
            .filter((item) => !item.innerText.includes("PATROCINADO"))
            .slice(0, 10)
            .map((item) => {
              const name = item.querySelector(".nameCard")?.innerText.trim() || "Nome não encontrado";
              const priceText = item.querySelector(".priceCard")?.innerText.trim() || "Preço não disponível";
              const image = item.querySelector("img")?.getAttribute("src") || "Imagem não encontrada";
              const link = item.querySelector("a")?.getAttribute("href") || "";
              const price = parseFloat(priceText.replace(/[^\d,]/g, "").replace(",", ".")) || 0;
              const reviewElement = item.querySelector(".ratingStarsContainer + span");
              const reviewCount = reviewElement
                ? parseInt(reviewElement.innerText.replace(/[()]/g, "").trim()) || 0
                : 0;

              return {
                searchTerm,
                name,
                price,
                reviewCount,
                image,
                url: link.startsWith("/") ? `https://www.kabum.com.br${link}` : link,
              };
            });
        }, term);

        allResults[term] = products;
      } catch (err) {
        console.warn(`Erro ao buscar produtos para "${term}":`, err.message);
        allResults[term] = [];
      }
    }

    await browser.close();

    let cheapestProducts = [];
    let mostReviewedProducts = [];
    let cheapestTotal = 0;
    let mostReviewedTotalPrice = 0;

    if (Object.keys(allResults).length > 1) {
      cheapestProducts = Object.values(allResults)
        .map((products) => products.sort((a, b) => a.price - b.price)[0])
        .filter(Boolean);

      mostReviewedProducts = Object.values(allResults)
        .map((products) => products.sort((a, b) => b.reviewCount - a.reviewCount)[0])
        .filter(Boolean);

      cheapestTotal = cheapestProducts.reduce((acc, product) => acc + product.price, 0);
      mostReviewedTotalPrice = mostReviewedProducts.reduce((acc, product) => acc + product.price, 0);
    } else if (Object.keys(allResults).length === 1) {
      const singleTerm = Object.keys(allResults)[0];
      const singleProducts = allResults[singleTerm];
      cheapestProducts = [singleProducts.sort((a, b) => a.price - b.price)[0]];
      mostReviewedProducts = [singleProducts.sort((a, b) => b.reviewCount - a.reviewCount)[0]];
      cheapestTotal = cheapestProducts[0]?.price || 0;
      mostReviewedTotalPrice = mostReviewedProducts[0]?.price || 0;
    }

    const response = {
      results: allResults,
      summary: {
        cheapestCombination: { products: cheapestProducts, totalPrice: cheapestTotal },
        mostReviewedCombination: { products: mostReviewedProducts, totalPrice: mostReviewedTotalPrice },
      },
    };

    cache.set(query, response);
    res.json(response);
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    await browser.close();
    res.status(500).json({ error: "Erro ao buscar produtos", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
