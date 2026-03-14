import Category from "../models/Category.js";

// List all categories for logged-in user
export const listCategories = async (req, res) => {
	try {
		const categories = await Category.find({ userId: req.user._id });
		res.status(200).json({ success: true, categories });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Create a new category
export const createCategory = async (req, res) => {
	try {
		const { name, type, keywords } = req.body; // Include keywords

		const existing = await Category.findOne({ name, userId: req.user._id });
		if (existing)
			return res
				.status(400)
				.json({ error: "Category with this name already exists" });

		const category = await Category.create({
			name,
			type,
			keywords: keywords || [], // Default to empty array if not provided
			userId: req.user._id,
		});

		res.status(201).json({ success: true, category });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Update a category
export const updateCategory = async (req, res) => {
	try {
		const { id } = req.params;
		const updated = await Category.findOneAndUpdate(
			{ _id: id, userId: req.user._id },
			req.body,
			{ new: true },
		);

		if (!updated) return res.status(404).json({ error: "Category not found" });

		res.status(200).json({ success: true, category: updated });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Delete a category
export const deleteCategory = async (req, res) => {
	try {
		const { id } = req.params;
		const deleted = await Category.findOneAndDelete({
			_id: id,
			userId: req.user._id,
		});
		if (!deleted) return res.status(404).json({ error: "Category not found" });

		res.status(200).json({ success: true, message: "Category deleted" });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};
