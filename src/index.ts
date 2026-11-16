import express, { Request, Response } from 'express';

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

app.get('/institution-portfolio', async (req: Request, res: Response) => {
    // We will build our Comment-Driven Architecture here
    res.json({ message: "Hello EMBL-EBI" });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
