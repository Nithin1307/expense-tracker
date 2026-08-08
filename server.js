require("dotenv").config();
const express=require("express");
const bcrypt=require("bcrypt");
const session=require("express-session");
const app=express();
const pool=require("./db/database");
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false
    })
);

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.redirect("/login");
    }
    next();
}

app.get("/signup", (req, res) => {
    res.render("signup", {
        error: null
    });
});

app.post("/signup", async (req, res) => {
    try {
        const {name,email,password}=req.body;
        const existingUser = await pool.query(
            "select id from users where email=$1",[email]
        );
        if (existingUser.rows.length>0){
            return res.render("signup", {
                error: "Email already exists"
            });
        }
        const hashedPassword=await bcrypt.hash(password,10);
        const result=await pool.query(
            `insert into users (name, email, password) values ($1, $2, $3) returning id,name`,[name,email,hashedPassword]
        );
        const user=result.rows[0];
        req.session.userId=user.id;
        req.session.userName=user.name;
        res.redirect("/");
    } catch (error) {
        console.log(error);
        res.render("signup", {
            error: "Something went wrong. Please try again."
        });
    }
});

app.get("/login", (req, res) => {
    res.render("login",{
        error: null
    });
});

app.post("/login", async (req, res) => {
    try {
        const {email,password}=req.body;
        const result=await pool.query(
            "select * from users where email = $1",[email]
        );
        if (result.rows.length === 0) {
            return res.send("Invalid email or password");
        }
        const user=result.rows[0];
        const passwordMatch=await bcrypt.compare(password,user.password);
        if (!passwordMatch) {
            return res.send("Invalid email or password");
        }
        req.session.userId=user.id;
        req.session.userName=user.name;
        res.redirect("/");
    } catch (error) {
        console.log(error);
        res.render("login", {
            error: "Something went wrong. Please try again."
        });
    }
});

app.get("/", requireLogin, async (req, res) => {
    try {
        const userId=req.session.userId;
        const result=await pool.query(
            "select * from transactions where user_id=$1 order by date DESC",[userId]
        );
        const incomeResult=await pool.query(
            `select coalesce(sum(amount), 0) as total from transactions where user_id=$1 and  type='income'`,[userId]
        );
        const expenseResult=await pool.query(
            `select coalesce(sum(amount), 0) as total from transactions where user_id=$1 and type='expense'`,[userId]
        );
        const income=incomeResult.rows[0].total;
        const expenses=expenseResult.rows[0].total;
        const balance=income-expenses;
        res.render("index", {
            transactions: result.rows,
            income: income,
            expenses: expenses,
            balance: balance,
            userName: req.session.userName
        });
    } catch (error) {
        console.log(error);
        res.send("Something went wrong");
    }
});

app.get("/add-expense", requireLogin, (req, res) => {
    res.render("add-expense");
});

app.post("/add-expense", requireLogin, async (req, res) => {
    try {
        const userId=req.session.userId;
        const {title,amount,type,category,date}=req.body;
        await pool.query(
            `insert into transactions (user_id,title,amount,type,category,date) values ($1,$2,$3,$4,$5,$6)`,[userId,title,amount,type,category,date]
        );
        res.redirect("/");
    } catch (error) {
        console.log(error);
        res.send("Something went wrong");
    }
});

app.get("/edit-expense/:id", requireLogin, async (req, res) => {
    try {
        const userId=req.session.userId;
        const { id }=req.params;
        const result=await pool.query(
            `select * from transactions where id = $1 and user_id = $2`,[id,userId]
        );
        if (result.rows.length === 0) {
            return res.send("Transaction not found");
        }
        res.render("edit-expense", {
            transaction: result.rows[0]
        });
    } catch (error) {
        console.log(error);
        res.send("Something went wrong");
    }
});

app.post("/edit-expense/:id", requireLogin, async (req, res) => {
    try {
        const userId=req.session.userId;
        const { id }=req.params;
        const {title,amount,type,category,date}=req.body;
        await pool.query(
            `update transactions set title = $1,amount = $2,type = $3,category = $4,date = $5 where id = $6 and user_id = $7`,[title,amount,type,category,date,id,userId]
        );
        res.redirect("/");
    } catch (error) {
        console.log(error);
        res.send("Something went wrong");
    }
});

app.post("/delete-expense/:id", requireLogin, async (req, res) => {
    try {
        const userId=req.session.userId;
        const { id }=req.params;
        await pool.query(
            `delete from transactions where id = $1 and user_id = $2`,[id,userId]
        );
        res.redirect("/");
    } catch (error) {
        console.log(error);
        res.send("Something went wrong");
    }
});

app.post("/logout", (req, res) => {
    req.session.destroy((error) => {
        res.redirect("/login");
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});