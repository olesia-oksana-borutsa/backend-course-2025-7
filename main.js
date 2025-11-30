import 'dotenv/config';
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import pkg from 'pg'; 
const { Client } = pkg;


const host = process.env.HOST || '0.0.0.0';
const port = process.env.PORT || 3000;
const cache = process.env.CACHE_DIR || './my-cache';

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};


const query = async (text, params) => {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } catch (err) {
    console.error("Database query error:", err);
    throw err;
  } finally {
    await client.end();
  }
};

if (!fs.existsSync(cache)) fs.mkdirSync(cache, { recursive: true });

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

// POST /register

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
app.post("/register", upload.single("photo"), async (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) return res.sendStatus(400);

  const newItem = {
    id: Date.now().toString(),
    name: inventory_name,
    description: description || "",
    photo: req.file ? req.file.filename : null,
  };

  try {
    await query(
      "INSERT INTO items (id, name, description, photo) VALUES ($1, $2, $3, $4)",
      [newItem.id, newItem.name, newItem.description, newItem.photo]
    );
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).send("Database error during registration.");
  }
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
app.get("/inventory", async (_, res) => {
  try {
    const result = await query("SELECT id, name, description, photo FROM items ORDER BY id DESC");
    const items = result.rows.map((i) => ({
      ...i,
      photo_url: i.photo ? `/inventory/${i.id}/photo` : null,
    }));
    res.json(items);
  } catch (error) {
    res.status(500).send("Database error retrieving inventory.");
  }
});

// get:/inventory/{id}:

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
app.get("/inventory/:id", async (req, res) => {
  try {
    const result = await query("SELECT id, name, description, photo FROM items WHERE id = $1", [req.params.id]);
    const item = result.rows[0];

    if (!item) return res.sendStatus(404);

    res.json({
      ...item,
      photo_url: item.photo ? `/inventory/${item.id}/photo` : null,
    });
  } catch (error) {
    res.status(500).send("Database error retrieving item.");
  }
});

// put:/inventory/{id}:

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
app.put("/inventory/:id", async (req, res) => {
  const { name, description } = req.body;
  let setClauses = [];
  let params = [];
  let paramIndex = 1;

  if (name) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(name);
  }
  if (description) {
    setClauses.push(`description = $${paramIndex++}`);
    params.push(description);
  }

  if (setClauses.length === 0) return res.status(400).send("No fields to update.");

  params.push(req.params.id); 
  const updateQuery = `UPDATE items SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

  try {
    const result = await query(updateQuery, params);
    if (result.rowCount === 0) return res.sendStatus(404);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).send("Database error during update.");
  }
});

// get:/inventory/{id}/photo:

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
app.get("/inventory/:id/photo", async (req, res) => {
  try {
    const result = await query("SELECT photo FROM items WHERE id = $1", [req.params.id]);
    const item = result.rows[0];

    if (!item || !item.photo) return res.sendStatus(404);

    const photoPath = path.resolve(cache, item.photo);
    if (!fs.existsSync(photoPath)) return res.sendStatus(404);
    res.sendFile(photoPath);
  } catch (error) {
    res.status(500).send("Database error retrieving photo path.");
  }
});

// put:/inventory/{id}/photo:

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
app.put("/inventory/:id/photo", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).send("No photo uploaded.");

  try {
    
    let result = await query("SELECT photo FROM items WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) return res.sendStatus(404);
    const oldPhoto = result.rows[0].photo;

    result = await query("UPDATE items SET photo = $1 WHERE id = $2 RETURNING *", [
      req.file.filename,
      req.params.id,
    ]);
    const item = result.rows[0];

   
    if (oldPhoto) {
      const oldPath = path.resolve(cache, oldPhoto);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    res.json(item);
  } catch (error) {
    res.status(500).send("Database error during photo update.");
  }
});

// delete:/inventory/{id}:

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
app.delete("/inventory/:id", async (req, res) => {
  try {
    let result = await query("SELECT photo FROM items WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) return res.sendStatus(404);
    const item = result.rows[0];

  
    const deleteResult = await query("DELETE FROM items WHERE id = $1", [req.params.id]);

    if (deleteResult.rowCount === 0) return res.sendStatus(404);

 
    if (item.photo) {
      const oldPath = path.resolve(cache, item.photo);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    res.sendStatus(200);
  } catch (error) {
    res.status(500).send("Database error during deletion.");
  }
});

// post:/search:

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
 *       200:
 *         description: Знайдено
 *       404:
 *         description: Не знайдено
 */
app.post("/search", async (req, res) => {
  const { id, includePhoto } = req.body;

  try {
    const result = await query("SELECT id, name, description, photo FROM items WHERE id = $1", [id]);
    const item = result.rows[0];

    if (!item) return res.sendStatus(404);

    const obj = {
      id: item.id,
      name: item.name,
      description: item.description,
    };
    if (includePhoto === "on" && item.photo) {
      obj.photo_url = `/inventory/${item.id}/photo`;
    }
    res.status(200).json(obj);
  } catch (error) {
    res.status(500).send("Database error during search.");
  }
});

// get:/search:

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
app.get("/search", async (req, res) => {
  const { id, includePhoto } = req.query;

  try {
    const result = await query("SELECT id, name, description, photo FROM items WHERE id = $1", [id]);
    const item = result.rows[0];

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
  } catch (error) {
    res.status(500).send("Database error during search.");
  }
});

app.use((_, res) => res.sendStatus(405));

app.listen(port, host, () =>
  console.log(`Server running at http://${host}:${port} `) 
);
