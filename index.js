import pg from "pg";
import express from "express";
import bodyParser from "body-parser";

const port = 3000;
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Add JSON parsing support
app.use(express.static("public"));

const db = new pg.Client({
    user: "postgres",
    password: "marko123",
    host: "localhost",
    port: 5432,
    database: "Mazor"
})
db.connect();

// Main routes
app.get("/", async(req,res) => {
    let proizvodi = (await db.query("SELECT * FROM proizvodiful_updated")).rows;
    res.render("index.ejs", { proizvodi:proizvodi })
})

app.get("/porudzbine", async(req,res) => {
    res.render("porudzbine.ejs")
})

app.get("/korisnici", async(req,res) => {
    let users = (await db.query('select * from users')).rows;
    res.render("korisnici.ejs", {users})
})

app.get("/subkategorije", async(req,res) => {
    let subkategorije = (await db.query('select * from subcategories order by id asc')).rows;
    res.render("subkategorije.ejs", {subkategorije});
})

app.get("/poruke", async(req,res) => {
    res.render("poruke.ejs")
})

// Dodana ruta za dodavanje nove subkategorije
app.post("/add-subcategory", async(req, res) => {
    try {
        const { naziv, category, slika } = req.body;
        const slikaURL = slika || '/api/placeholder/60/60'; // Default slika ako nije uneta
        
        // Dodaj novu subkategoriju u bazu
        const result = await db.query(
            "INSERT INTO subcategories (naziv, category, slika) VALUES ($1, $2, $3) RETURNING *",
            [naziv, category, slikaURL]
        );
        
        // Nakon uspešnog dodavanja, preusmeri nazad na stranicu subkategorija
        res.redirect("/subkategorije");
    } catch (error) {
        console.error("Greška pri dodavanju subkategorije:", error);
        res.status(500).send("Došlo je do greške pri dodavanju subkategorije.");
    }
});

// API endpoints for product management
// Get all products
app.get("/api/products", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM proizvodiful_updated");
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Greška pri dohvatanju proizvoda" });
    }
});

// Get a single product
app.get("/api/products/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query("SELECT * FROM proizvodiful_updated WHERE id = $1", [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Proizvod nije pronađen" });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ error: "Greška pri dohvatanju proizvoda" });
    }
});

// Create a new product
app.post("/api/products", async (req, res) => {
    try {
        const { sifra, naziv, cena_sapdv, vrednost_sapdv, subcategories, brend, slka } = req.body;
        
        const result = await db.query(
            "INSERT INTO proizvodiful_updated (sifra, naziv, cena_sapdv, vrednost_sapdv, subcategories, brend, slka) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
            [sifra, naziv, cena_sapdv, vrednost_sapdv, subcategories, brend, slka]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({ error: "Greška pri kreiranju proizvoda" });
    }
});

// Update an existing product
app.put("/api/products", async (req, res) => {
    try {
        const { id, sifra, naziv, cena_sapdv, vrednost_sapdv, subcategories, brend, slka } = req.body;
        
        console.log("Updating product with ID:", id);
        console.log("Request body:", req.body);
        
        // Ensure the ID is present
        if (!id) {
            return res.status(400).json({ error: "ID proizvoda je obavezan" });
        }
        
        const result = await db.query(
            "UPDATE proizvodiful_updated SET sifra = $1, naziv = $2, cena_sapdv = $3, vrednost_sapdv = $4, subcategories = $5, brend = $6, slka = $7 WHERE id = $8 RETURNING *",
            [sifra, naziv, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, id]
        );
        
        if (result.rows.length === 0) {
            console.log("Product not found for update, ID:", id);
            return res.status(404).json({ error: "Proizvod nije pronađen" });
        }
        
        console.log("Product updated successfully:", result.rows[0]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ error: "Greška pri ažuriranju proizvoda: " + error.message });
    }
});

// Delete a product
app.delete("/api/products/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query("DELETE FROM proizvodiful_updated WHERE id = $1 RETURNING *", [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Proizvod nije pronađen" });
        }
        
        res.json({ message: "Proizvod uspešno obrisan", product: result.rows[0] });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ error: "Greška pri brisanju proizvoda" });
    }
});

app.listen(port, () => {
    console.log(`Ide radi na portu ${port}`);
});