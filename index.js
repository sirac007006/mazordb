import pg from "pg";
import express from "express";
import bodyParser from "body-parser";

const port = 3000;
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const db = new pg.Client({
    user: "postgres",
    password: "marko123",
    host: "localhost",
    port: 5432,
    database: "Mazor"
})
db.connect();
app.get("/", async(req,res) => {
    let proizvodi = (await db.query("select * from proizvodi order by my_id desc")).rows;
    res.render("index.ejs", { proizvodi:proizvodi })
})
app.get("/porudzbine", async(req,res) => {
    res.render("porudzbine.ejs")
})
app.get("/korisnici", async(req,res) => {
    res.render("korisnici.ejs")
})
app.get("/subkategorije", async(req,res) => {
    res.render("subkategorije.ejs")
})
app.get("/poruke", async(req,res) => {
    res.render("poruke.ejs")
})
app.listen(port, () => {
    console.log(`Ide radi`);
});