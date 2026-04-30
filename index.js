import pg from "pg";
import express from "express";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import session from "express-session";

const port = process.env.PORT || 3000;
const app = express();

// HASHOVI - generisani sa bcrypt.hash()
const HASH_USERNAME = "$2a$12$T8hIcBarfOkay2FDEijmnOlHa79PVXFBa1L6cZJUfljLmfUfYBxUa";
const HASH_PASSWORD = "$2a$12$/EEyUOMrrRBvJPnIGk9oBOPv4i3iRydRgyne.xtsKbdXB1AbA6Nba";

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// Sesije
app.use(session({
    secret: "tajna-sesija",
    resave: false,
    saveUninitialized: false,
}));

// Middleware za proveru ulogovanosti
app.use((req, res, next) => {
    if (req.path === "/login") return next();
    if (!req.session.loggedIn) {
        return res.redirect("/login");
    }
    next();
});
// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});
const db = new pg.Client({
    user: "marko",
    password: "O95iBz6rttFi1PJDPZRcXuQIF50rn1Rh",
    host: "d0j277ffte5s73c6kp70-a.oregon-postgres.render.com",
    port: 5432,
    database: "mazor_ngl2",
    ssl: {
        rejectUnauthorized: false,
    },
});

db.connect().then(async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS poruke (
            id         SERIAL PRIMARY KEY,
            ime_prezime VARCHAR(200),
            email      VARCHAR(150),
            telefon    VARCHAR(25),
            predmet    VARCHAR(255),
            poruka     TEXT,
            procitano  BOOLEAN DEFAULT FALSE,
            datum      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('Tabela poruke OK');
}).catch(err => console.error('DB connect error:', err));

// Login rute
app.get("/login", (req, res) => {
    res.render("login.ejs", { error: null });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const validUsername = await bcrypt.compare(username, HASH_USERNAME);
    const validPassword = await bcrypt.compare(password, HASH_PASSWORD);

    if (validUsername && validPassword) {
        req.session.loggedIn = true;
        res.redirect("/");
    } else {
        res.render("login.ejs", { error: "Pogrešno korisničko ime ili lozinka." });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});
app.get("/", async(req,res) => {
    let proizvodi = (await db.query("SELECT * FROM proizvodiful_updated")).rows;
    let subkategorije = (await db.query("SELECT * FROM subcategories ORDER BY category ASC, naziv ASC")).rows;
    res.render("index.ejs", { proizvodi, subkategorije })
});

const ORDER_BASE_QUERY = `
    SELECT p.*,
           k.ime || ' ' || COALESCE(k.prezime, '') AS korisnik_ime,
           k.email AS korisnik_email
    FROM porudzbine p
    LEFT JOIN korisnici k ON p.iduser::integer = k.id
`;

app.get("/porudzbine", async(req, res) => {
    try {
        let query = ORDER_BASE_QUERY;
        let params = [];

        if (req.query.search) {
            query += `
                WHERE p.id::text ILIKE $1
                   OR p.adresa ILIKE $1
                   OR p.sadrzaj ILIKE $1
                   OR p.iznos::text ILIKE $1
                   OR k.ime ILIKE $1
                   OR k.prezime ILIKE $1
            `;
            params = [`%${req.query.search}%`];
        } else if (req.query.status && req.query.status !== 'all') {
            query += " WHERE p.status = $1";
            params = [req.query.status];
        }

        query += " ORDER BY p.id DESC";

        const result = await db.query(query, params);
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
    let users = (await db.query('SELECT id, ime, prezime, email, telefon, adresa, grad, pbroj FROM korisnici ORDER BY id ASC')).rows;
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
        const result = await db.query(`
            SELECT p.*,
                   k.ime || ' ' || COALESCE(k.prezime, '') AS korisnik_ime,
                   k.email AS korisnik_email
            FROM porudzbine p
            LEFT JOIN korisnici k ON p.iduser::integer = k.id
            WHERE p.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Porudžbina nije pronađena" });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching order:", error);
        res.status(500).json({ error: "Greška pri dohvatanju porudžbine" });
    }
});

// Update order status + send email
app.put("/api/orders/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: "Nevažeći status" });
        }

        const result = await db.query(`
            UPDATE porudzbine SET status = $1 WHERE id = $2
            RETURNING *,
                (SELECT k.ime || ' ' || COALESCE(k.prezime,'') FROM korisnici k WHERE k.id = iduser::integer) AS korisnik_ime,
                (SELECT k.email FROM korisnici k WHERE k.id = iduser::integer) AS korisnik_email
        `, [status, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Porudžbina nije pronađena" });
        }

        const order = result.rows[0];

        res.json(order);
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ error: "Greška pri ažuriranju statusa porudžbine" });
    }
});

// Subcategory routes
app.post("/add-subcategory", async (req, res) => {
    try {
        const { naziv, category, slika } = req.body;

        const result = await db.query(
            "INSERT INTO subcategories (naziv, category, slika) VALUES ($1, $2, $3) RETURNING *",
            [naziv, category, slika || null]
        );

        res.redirect("/subkategorije");
    } catch (error) {
        console.error("Error adding subcategory:", error);
        res.redirect("/subkategorije");
    }
});

app.post("/edit-subcategory", async (req, res) => {
    try {
        const { id, naziv, category, slika } = req.body;

        const result = await db.query(
            "UPDATE subcategories SET naziv = $1, category = $2, slika = $3 WHERE id = $4 RETURNING *",
            [naziv, category, slika || null, id]
        );

        res.redirect("/subkategorije");
    } catch (error) {
        console.error("Error editing subcategory:", error);
        res.redirect("/subkategorije");
    }
});

app.post("/delete-subcategory", async (req, res) => {
    try {
        const { id } = req.body;

        const result = await db.query("DELETE FROM subcategories WHERE id = $1 RETURNING *", [id]);

        res.redirect("/subkategorije");
    } catch (error) {
        console.error("Error deleting subcategory:", error);
        res.redirect("/subkategorije");
    }
});

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
app.put("/api/products/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { sifra, naziv, kolicina, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, deskripcija, izdvajanje } = req.body;

        console.log('UPDATE product - ID:', id, 'Data:', req.body);

        if (!id) {
            return res.status(400).json({ error: "ID proizvoda je obavezan" });
        }

        // Proveri da li proizvod postoji
        const productExists = await db.query(
            "SELECT id FROM proizvodiful_updated WHERE id = $1",
            [id]
        );

        if (productExists.rows.length === 0) {
            return res.status(404).json({ error: "Proizvod nije pronađen" });
        }

        // Proveri da li šifra već postoji za drugi proizvod
        const existingProduct = await db.query(
            "SELECT id FROM proizvodiful_updated WHERE sifra = $1 AND id != $2",
            [sifra, id]
        );

        if (existingProduct.rows.length > 0) {
            console.log('Šifra već postoji za drugi proizvod:', sifra);
            return res.status(400).json({ error: "Šifra već postoji za drugi proizvod" });
        }

        const result = await db.query(
            "UPDATE proizvodiful_updated SET sifra = $1, naziv = $2, kolicina = $3, cena_sapdv = $4, vrednost_sapdv = $5, subcategories = $6, brend = $7, slka = $8, deskripcija = $9, izdvajanje = $10 WHERE id = $11 RETURNING *",
            [sifra, naziv, kolicina, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, deskripcija, izdvajanje, id]
        );

        console.log('UPDATE product - Success:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ error: "Greška pri ažuriranju proizvoda: " + error.message });
    }
});
app.post("/api/products", async (req, res) => {
    try {
        const { sifra, naziv, kolicina, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, deskripcija, izdvajanje } = req.body;

        if (!sifra || !naziv || !cena_sapdv) {
            return res.status(400).json({ error: "Šifra, naziv i cijena su obavezna polja" });
        }

        const existingProduct = await db.query(
            "SELECT id FROM proizvodiful_updated WHERE sifra = $1",
            [sifra]
        );
        if (existingProduct.rows.length > 0) {
            return res.status(400).json({ error: "Šifra već postoji u bazi podataka" });
        }

        // Generiši ID jer tabela nema auto-increment sekvencu
        const maxIdResult = await db.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM proizvodiful_updated");
        const nextId = maxIdResult.rows[0].next_id;

        const result = await db.query(
            "INSERT INTO proizvodiful_updated (id, sifra, naziv, kolicina, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, deskripcija, izdvajanje) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *",
            [nextId, sifra, naziv, kolicina || null, cena_sapdv, vrednost_sapdv || cena_sapdv, subcategories || null, brend || null, slka || null, deskripcija || null, izdvajanje || null]
        );

        console.log('CREATE product - Success, id:', result.rows[0].id);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({ error: "Greška pri kreiranju proizvoda: " + error.message });
    }
});

app.put("/api/products", async (req, res) => {
    try {
        const { id, sifra, naziv, kolicina, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, deskripcija, izdvajanje } = req.body;

        if (!id) {
            return res.status(400).json({ error: "ID proizvoda je obavezan" });
        }

        // Proveri da li šifra već postoji za drugi proizvod
        const existingProduct = await db.query(
            "SELECT id FROM proizvodiful_updated WHERE sifra = $1 AND id != $2",
            [sifra, id]
        );

        if (existingProduct.rows.length > 0) {
            return res.status(400).json({ error: "Šifra već postoji za drugi proizvod" });
        }

        const result = await db.query(
            "UPDATE proizvodiful_updated SET sifra = $1, naziv = $2, kolicina = $3, cena_sapdv = $4, vrednost_sapdv = $5, subcategories = $6, brend = $7, slka = $8, deskripcija = $9, izdvajanje = $10 WHERE id = $11 RETURNING *",
            [sifra, naziv, kolicina, cena_sapdv, vrednost_sapdv, subcategories, brend, slka, deskripcija, izdvajanje, id]
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

app.listen(port, '0.0.0.0', () => {
    console.log(`Server radi na portu ${port}`);
});