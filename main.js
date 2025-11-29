import { Command } from "commander";
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

const program = new Command();

program
  .requiredOption("-h, --host <host>")
  .requiredOption("-p, --port <port>")
  .requiredOption("-c, --cache <cacheDir>");

program.parse(process.argv);

const { host, port, cache } = program.opts();

if (!fs.existsSync(cache)) fs.mkdirSync(cache, { recursive: true });

const dbPath = path.join(cache, "inventory.json");
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify([]));

const readDB = () => JSON.parse(fs.readFileSync(dbPath, "utf-8"));
const writeDB = (data) =>
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, cache),
  filename: (_, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: { title: "Inventory API", version: "1.0.0" },
  },
  apis: ["./main.js"],
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /RegisterForm.html:
 *   get:
 *     summary: HTML-форма для реєстрації
 *     responses:
 *       200:
 *         description: HTML-сторінка
 */
app.get("/RegisterForm.html", (_, res) =>
  res.sendFile(path.resolve("RegisterForm.html"))
);

/**
 * @swagger
 * /SearchForm.html:
 *   get:
 *     summary: HTML-форма для пошуку
 *     responses:
 *       200:
 *         description: HTML-сторінка
 */
app.get("/SearchForm.html", (_, res) =>
  res.sendFile(path.resolve("SearchForm.html"))
);

//POST /register

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нової речі
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Створено
 *       400:
 *         description: Поганий запит
 */
app.post("/register", upload.single("photo"), (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) return res.sendStatus(400);

  const items = readDB();
  const newItem = {
    id: Date.now().toString(),
    name: inventory_name,
    description: description || "",
    photo: req.file ? req.file.filename : null,
  };
  items.push(newItem);
  writeDB(items);
  res.status(201).json(newItem);
});

// get:/inventory:
 
/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримання списку речей
 *     responses:
 *       200:
 *         description: Масив речей
 */
app.get("/inventory", (_, res) => {
  const items = readDB().map((i) => ({
    ...i,
    photo_url: i.photo ? `/inventory/${i.id}/photo` : null,
  }));
  res.json(items);
});

//    get:/inventory/{id}:

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримання однієї речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Об'єкт речі
 *       404:
 *         description: Не знайдено
 */
app.get("/inventory/:id", (req, res) => {
  const item = readDB().find((i) => i.id === req.params.id);
  if (!item) return res.sendStatus(404);
  res.json({
    ...item,
    photo_url: item.photo ? `/inventory/${item.id}/photo` : null,
  });
});

//  put:/inventory/{id}:
 
/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновлення назви/опису
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Оновлено
 *       404:
 *         description: Не знайдено
 */
app.put("/inventory/:id", (req, res) => {
  const items = readDB();
  const item = items.find((i) => i.id === req.params.id);
  if (!item) return res.sendStatus(404);

  if (req.body.name) item.name = req.body.name;
  if (req.body.description) item.description = req.body.description;
  writeDB(items);
  res.json(item);
});

//    get:/inventory/{id}/photo:

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримання фото
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Фото
 *       404:
 *         description: Фото не знайдено
 */
app.get("/inventory/:id/photo", (req, res) => {
  const item = readDB().find((i) => i.id === req.params.id);
  if (!item || !item.photo) return res.sendStatus(404);

  const photoPath = path.resolve(cache, item.photo);
  if (!fs.existsSync(photoPath)) return res.sendStatus(404);
  res.sendFile(photoPath);
});

//   put:/inventory/{id}/photo:

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновлення фото
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       404:
 *         description: Не знайдено
 */
app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  const items = readDB();
  const item = items.find((i) => i.id === req.params.id);
  if (!item) return res.sendStatus(404);
  if (!req.file) return res.status(400).send("No photo uploaded.");
  if (item.photo) {
    const oldPath = path.resolve(cache, item.photo);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  item.photo = req.file.filename;
  writeDB(items);
  res.json(item);
});

//   delete:/inventory/{id}:
 
/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалення речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Видалено
 *       404:
 *         description: Не знайдено
 */
app.delete("/inventory/:id", (req, res) => {
  const items = readDB();
  const index = items.findIndex((i) => i.id === req.params.id);
  if (index === -1) return res.sendStatus(404);

  const item = items[index];
  if (item.photo) {
    const oldPath = path.resolve(cache, item.photo);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  items.splice(index, 1);
  writeDB(items);
  res.sendStatus(200);
});

//   post:/search:
 
/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук речі (POST)
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *               includePhoto:
 *                 type: string
 *     responses:
 *       201:
 *         description: Знайдено
 *       404:
 *         description: Не знайдено
 */
app.post("/search", (req, res) => {
  const { id, includePhoto } = req.body;

  const item = readDB().find((i) => i.id === id);
  if (!item) return res.sendStatus(404);

  const obj = {
    id: item.id,
    name: item.name,
    description: item.description,
  };
  if (includePhoto === "on" && item.photo) {
    obj.photo_url = `/inventory/${item.id}/photo`;
  }
  res.status(201).json(obj);
});

//    get:/search:

/**
 * @swagger
 * /search:
 *   get:
 *     summary: Пошук речі (GET )
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includePhoto
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Знайдено
 *       404:
 *         description: Не знайдено
 */
app.get("/search", (req, res) => {
  const { id, includePhoto } = req.query;
  const item = readDB().find((i) => i.id === id);
  if (!item) return res.sendStatus(404);
  const obj = {
    id: item.id,
    name: item.name,
    description: item.description,
  };
  if (includePhoto === "on" && item.photo) {
    obj.photo_url = `/inventory/${item.id}/photo`;
  }
  res.json(obj);
});
app.use((_, res) => res.sendStatus(405));
app.listen(port, host, () =>
  console.log(`Server running at http://${host}:${port}`)
);