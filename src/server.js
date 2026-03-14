import app from "./app.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
	console.log(`Kuditrak V2 backend running on port ${PORT}`);
});
