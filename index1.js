import pg from "pg";
import express from "express";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import session from "express-session";

const port = 3000;
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// Dodaj session
app.use(session({
    secret: "tajna_sifra_sesije",
    resave: false,
    saveUninitialized: false,
}));

// Middleware za zaštitu svih ruta osim login
app.use((req, res, next) => {
    if (req.path === "/login" || req.path === "/logout") {
        return next();
    }
    if (!req.session.loggedIn) {
        return res.redirect("/login");
    }
    next();
});

// Hardcoded bcrypt hashovani podaci
const hashUsername = "$2a$12$T8hIcBarfOkay2FDEijmnOlHa79PVXFBa1L6cZJUfljLmfUfYBxUa";
const hashPassword = "$2a$12$/EEyUOMrrRBvJPnIGk9oBOPv4i3iRydRgyne.xtsKbdXB1AbA6Nba";

const db = new pg.Client({
    user: "postgres",
    password: "marko123",
    host: "localhost",
    port: 5432,
    database: "Mazor"
});
db.connect();

// Login rute
app.get("/login", (req, res) => {
    res.render("login.ejs", { error: null });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const isUserValid = await bcrypt.compare(username, hashUsername);
    const isPassValid = await bcrypt.compare(password, hashPassword);

    if (isUserValid && isPassValid) {
        req.session.loggedIn = true;
        res.redirect("/");
    } else {
        res.render("login.ejs", { error: "Pogrešan username ili šifra." });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});
app.get("/", async(req,res) => {
    let proizvodi = (await db.query("SELECT * FROM proizvodiful_updated")).rows;
    let subcategories = (await db.query("SELECT * FROM subcategories")).rows;
    res.render("index.ejs", { proizvodi, subcategories })
});

app.get("/login", async(req,res) => {
    res.render("login.ejs")
});
app.post("/login", async(req,res) => {
    console.log(req.body);

});
// Route for orders page with search and filter
app.get("/porudzbine", async(req, res) => {
    try {
        let query = "SELECT * FROM porudzbine";
        let params = [];
        
        // Apply search filter if provided
        if (req.query.search) {
            query = `
                SELECT * FROM porudzbine 
                WHERE id::text ILIKE $1 
                OR iduser::text ILIKE $1 
                OR adresa ILIKE $1
                OR sadrzaj ILIKE $1
                OR iznos::text ILIKE $1
            `;
            params = [`%${req.query.search}%`];
        } 
        // Apply status filter if provided
        else if (req.query.status && req.query.status !== 'all') {
            query += " WHERE status = $1";
            params = [req.query.status];
        }
        
        // Add order by clause
        query += " ORDER BY id ASC";
        
        // Execute the query
        const result = await db.query(query, params);
        
        // Render the template with the results
        res.render("porudzbine.ejs", { 
            porudzbine: result.rows,
            searchTerm: req.query.search || '',
            currentFilter: req.query.status || 'all'
        });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.render("porudzbine.ejs", { 
            porudzbine: [],
            error: "Greška pri učitavanju porudžbina",
            searchTerm: req.query.search || '',
            currentFilter: req.query.status || 'all'
        });
    }
});

app.get("/korisnici", async(req,res) => {
    let users = (await db.query('select * from users')).rows;
    res.render("korisnici.ejs", {users})
});

app.get("/subkategorije", async(req,res) => {
    let subkategorije = (await db.query('select * from subcategories order by id asc')).rows;
    res.render("subkategorije.ejs", {subkategorije});
});

// Modified route for poruke - now fetching from database
app.get("/poruke", async(req, res) => {
    try {
        let query = "SELECT * FROM poruke";
        let params = [];
        
        // Apply search filter if provided
        if (req.query.search) {
            query = `
                SELECT * FROM poruke 
                WHERE id::text ILIKE $1 
                OR ime_prezime ILIKE $1 
                OR email ILIKE $1
                OR telefon ILIKE $1
                OR predmet ILIKE $1
                OR poruka ILIKE $1
            `;
            params = [`%${req.query.search}%`];
        }
        
        // Add order by clause
        query += " ORDER BY id ASC";
        
        // Execute the query
        const result = await db.query(query, params);
        
        // Calculate pagination
        const itemsPerPage = 5;
        const page = parseInt(req.query.page) || 1;
        const totalItems = result.rows.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedResults = result.rows.slice(startIndex, endIndex);
        
        // Render the template with the results
        res.render("poruke.ejs", { 
            poruke: paginatedResults,
            pagination: {
                current: page,
                total: totalPages
            },
            searchTerm: req.query.search || ''
        });
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.render("poruke.ejs", { 
            poruke: [],
            error: "Greška pri učitavanju poruka",
            searchTerm: req.query.search || ''
        });
    }
});

// API endpoint for fetching a single message
app.get("/api/poruke/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query("SELECT * FROM poruke WHERE id = $1", [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Poruka nije pronađena" });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching message:", error);
        res.status(500).json({ error: "Greška pri dohvatanju poruke" });
    }
});

// API endpoint for marking a message as read
app.put("/api/poruke/:id/procitano", async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(
            "UPDATE poruke SET procitano = true WHERE id = $1 RETURNING *",
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Poruka nije pronađena" });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error marking message as read:", error);
        res.status(500).json({ error: "Greška pri označavanju poruke kao pročitane" });
    }
});

// Order API endpoints
app.get("/api/orders/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query("SELECT * FROM porudzbine WHERE id = $1", [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Porudžbina nije pronađena" });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching order:", error);
        res.status(500).json({ error: "Greška pri dohvatanju porudžbine" });
    }
});

// Update order status
app.put("/api/orders/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: "Nevažeći status" });
        }
        
        const result = await db.query(
            "UPDATE porudzbine SET status = $1 WHERE id = $2 RETURNING *",
            [status, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Porudžbina nije pronađena" });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ error: "Greška pri ažuriranju statusa porudžbine" });
    }
});

// Existing API endpoints for products
app.get("/api/products", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM proizvodiful_updated");
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Greška pri dohvatanju proizvoda" });
    }
});

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

app.post("/api/products", async (req, res) => {
    try {
        const { sifra, naziv, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, deskripcija } = req.body;
        
        const result = await db.query(
            "INSERT INTO proizvodiful_updated (sifra, naziv, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, deskripcija) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
            [sifra, naziv, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, deskripcija]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({ error: "Greška pri kreiranju proizvoda" });
    }
});
app.put("/api/products", async (req, res) => {
    try {
        const { id, sifra, naziv, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, deskripcija } = req.body;
        
        if (!id) {
            return res.status(400).json({ error: "ID proizvoda je obavezan" });
        }
        
        const result = await db.query(
            "UPDATE proizvodiful_updated SET sifra = $1, naziv = $2, cena_sapdv = $3, vrednost_sapdv = $4, subcategories = $5, brend = $6, slka = $7, deskripcija = $9 WHERE id = $8 RETURNING *",
            [sifra, naziv, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, id, deskripcija]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Proizvod nije pronađen" });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ error: "Greška pri ažuriranju proizvoda: " + error.message });
    }
});

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
    console.log(`Server radi na portu ${port}`);
});