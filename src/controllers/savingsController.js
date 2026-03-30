// controllers/savingsBucketController.js (updated functions)
import cron from "node-cron";
import SavingsBucket from "../models/SavingsBucket.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { sendSavingNotification } from "../services/notificationService.js";
import { checkLimits } from "../services/subscriptionService.js";

// List all buckets for the user
export const listBuckets = async (req, res) => {
	try {
		const buckets = await SavingsBucket.find({ userId: req.user._id }).sort({
			createdAt: -1,
		});
		res.status(200).json(buckets);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Get single bucket by ID
export const getBucketById = async (req, res) => {
	try {
		const { id } = req.params;
		const bucket = await SavingsBucket.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!bucket) {
			return res.status(404).json({ error: "Bucket not found" });
		}

		res.status(200).json(bucket);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Update bucket (rename, adjust target, update auto-save settings)
export const updateBucket = async (req, res) => {
	try {
		const { id } = req.params;
		const { name, targetAmount, frequency, autoSaveAmount, autoSaveEnabled } =
			req.body;

		const bucket = await SavingsBucket.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!bucket) {
			return res.status(404).json({ error: "Bucket not found" });
		}

		// Update fields
		if (name) bucket.name = name;
		if (targetAmount) bucket.targetAmount = targetAmount;

		// Update auto-save settings
		if (
			frequency !== undefined ||
			autoSaveAmount !== undefined ||
			autoSaveEnabled !== undefined
		) {
			bucket.topUpSchedule = {
				frequency:
					frequency !== undefined ? frequency : bucket.topUpSchedule.frequency,
				amount:
					autoSaveAmount !== undefined
						? autoSaveAmount
						: bucket.topUpSchedule.amount,
				autoSaveEnabled:
					autoSaveEnabled !== undefined
						? autoSaveEnabled
						: bucket.topUpSchedule.autoSaveEnabled,
			};

			// Reschedule auto-save if settings changed
			if (
				bucket.topUpSchedule.autoSaveEnabled &&
				bucket.topUpSchedule.frequency !== "none" &&
				bucket.topUpSchedule.amount > 0
			) {
				scheduleAutoSave(
					bucket._id,
					bucket.userId,
					bucket.topUpSchedule.frequency,
					bucket.topUpSchedule.amount,
				);
			} else {
				// Stop auto-save if disabled
				if (scheduledJobs.has(bucket._id)) {
					scheduledJobs.get(bucket._id).stop();
					scheduledJobs.delete(bucket._id);
					console.log(`Auto-save stopped for bucket ${bucket._id}`);
				}
			}
		}

		bucket.updatedAt = new Date();
		await bucket.save();

		res.json(bucket);
	} catch (err) {
		console.error("Update bucket error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Delete a bucket
export const deleteBucket = async (req, res) => {
	try {
		const { id } = req.params;

		// Stop auto-save schedule if exists
		if (scheduledJobs.has(id)) {
			scheduledJobs.get(id).stop();
			scheduledJobs.delete(id);
			console.log(`Auto-save stopped for deleted bucket ${id}`);
		}

		const deleted = await SavingsBucket.findOneAndDelete({
			_id: id,
			userId: req.user._id,
		});

		await sendSavingNotification(
			req.user._id,
			bucket.name,
			0,
			bucket.targetAmount,
			"deleted",
		);

		if (!deleted) {
			return res.status(404).json({ error: "Bucket not found" });
		}

		res.json({ message: "Bucket deleted successfully" });
	} catch (err) {
		console.error("Delete bucket error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Toggle auto-save for a bucket
export const toggleAutoSave = async (req, res) => {
	try {
		const { id } = req.params;
		const { enabled } = req.body;

		const bucket = await SavingsBucket.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!bucket) {
			return res.status(404).json({ error: "Bucket not found" });
		}

		bucket.topUpSchedule.autoSaveEnabled = enabled;
		bucket.updatedAt = new Date();
		await bucket.save();

		if (
			enabled &&
			bucket.topUpSchedule.frequency !== "none" &&
			bucket.topUpSchedule.amount > 0
		) {
			scheduleAutoSave(
				bucket._id,
				bucket.userId,
				bucket.topUpSchedule.frequency,
				bucket.topUpSchedule.amount,
			);
		} else {
			if (scheduledJobs.has(bucket._id)) {
				scheduledJobs.get(bucket._id).stop();
				scheduledJobs.delete(bucket._id);
			}
		}

		res.json({
			success: true,
			message: enabled ? "Auto-save enabled" : "Auto-save disabled",
			bucket,
		});
	} catch (err) {
		console.error("Toggle auto-save error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Store scheduled jobs (in production, use a job queue like Bull)
const scheduledJobs = new Map();

// Helper function to schedule auto-save
const scheduleAutoSave = (bucketId, userId, frequency, amount) => {
	// Remove existing schedule if any
	if (scheduledJobs.has(bucketId)) {
		scheduledJobs.get(bucketId).stop();
		scheduledJobs.delete(bucketId);
	}

	if (!frequency || frequency === "none") return;

	let cronExpression;
	switch (frequency) {
		case "daily":
			cronExpression = "0 0 * * *"; // Every day at midnight
			break;
		case "weekly":
			cronExpression = "0 0 * * 1"; // Every Monday at midnight
			break;
		case "bi-weekly":
			cronExpression = "0 0 */14 * *"; // Every 14 days
			break;
		case "monthly":
			cronExpression = "0 0 1 * *"; // 1st of every month at midnight
			break;
		default:
			return;
	}

	const job = cron.schedule(cronExpression, async () => {
		try {
			console.log(`Running auto-save for bucket ${bucketId}`);

			const bucket = await SavingsBucket.findOne({
				_id: bucketId,
				userId: userId,
			});

			if (!bucket) {
				console.log(`Bucket ${bucketId} not found, stopping auto-save`);
				if (scheduledJobs.has(bucketId)) {
					scheduledJobs.get(bucketId).stop();
					scheduledJobs.delete(bucketId);
				}
				return;
			}

			// Check if bucket is locked - don't auto-save to locked buckets
			if (bucket.isLocked) {
				console.log(`Bucket ${bucketId} is locked, skipping auto-save`);
				return;
			}

			// Check if bucket is already completed
			if (bucket.currentAmount >= bucket.targetAmount) {
				console.log(`Bucket ${bucketId} already completed, stopping auto-save`);
				if (scheduledJobs.has(bucketId)) {
					scheduledJobs.get(bucketId).stop();
					scheduledJobs.delete(bucketId);
				}
				return;
			}

			const wallet = await Wallet.findOne({ userId: userId });

			if (!wallet) {
				console.log(`Wallet not found for user ${userId}`);
				return;
			}

			if (wallet.balance >= amount) {
				// Deduct from wallet
				wallet.balance -= amount;
				await wallet.save();

				// Credit the bucket
				bucket.currentAmount += amount;
				await bucket.save();

				console.log(`Auto-saved ${amount} to bucket ${bucketId}`);
			} else {
				console.log(
					`Insufficient balance for auto-save: ${amount} available: ${wallet.balance}`,
				);
			}
		} catch (err) {
			console.error(`Error in auto-save for bucket ${bucketId}:`, err);
		}
	});

	scheduledJobs.set(bucketId, job);
	console.log(
		`Auto-save scheduled for bucket ${bucketId} with frequency ${frequency}`,
	);
};

// Create a new savings bucket with optional lock
export const createBucket = async (req, res) => {
	try {
		const {
			name,
			targetAmount,
			frequency,
			autoSaveAmount,
			lockEnabled,
			unlockDate,
		} = req.body;

		// Check if user has reached bucket limit
		await checkLimits(req.user._id, "saving_bucket");

		let wallet = await Wallet.findOne({ userId: req.user._id });

		if (!wallet) {
			wallet = await Wallet.create({ userId: req.user._id });
		}

		// Validate lock date if provided
		let lockSettings = {
			enabled: lockEnabled || false,
			unlockDate: null,
			lockedAt: null,
			originalTargetAmount: null,
		};

		if (lockEnabled && unlockDate) {
			const unlockDateObj = new Date(unlockDate);
			if (isNaN(unlockDateObj.getTime())) {
				return res.status(400).json({ error: "Invalid unlock date" });
			}

			if (unlockDateObj <= new Date()) {
				return res
					.status(400)
					.json({ error: "Unlock date must be in the future" });
			}

			lockSettings = {
				enabled: true,
				unlockDate: unlockDateObj,
				lockedAt: new Date(),
				originalTargetAmount: targetAmount,
			};
		}

		const bucket = new SavingsBucket({
			userId: req.user._id,
			walletId: wallet._id,
			name,
			targetAmount,
			currentAmount: 0,
			topUpSchedule: {
				frequency: frequency || "none",
				amount: autoSaveAmount || 0,
				autoSaveEnabled: !!(
					frequency &&
					frequency !== "none" &&
					autoSaveAmount > 0
				),
			},
			lockSettings,
		});

		await bucket.save();

		// Schedule auto-save if enabled
		if (bucket.topUpSchedule.autoSaveEnabled) {
			scheduleAutoSave(
				bucket._id,
				bucket.userId,
				bucket.topUpSchedule.frequency,
				bucket.topUpSchedule.amount,
			);
		}

		await sendSavingNotification(
			req.user._id,
			bucket.name,
			0,
			bucket.targetAmount,
			"created",
		);

		res.status(201).json(bucket);
	} catch (err) {
		console.error("Create bucket error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Lock a bucket
export const lockBucket = async (req, res) => {
	try {
		const { id } = req.params;
		const { unlockDate } = req.body;

		const bucket = await SavingsBucket.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!bucket) {
			return res.status(404).json({ error: "Bucket not found" });
		}

		if (bucket.lockSettings.enabled) {
			return res.status(400).json({ error: "Bucket is already locked" });
		}

		const unlockDateObj = new Date(unlockDate);
		if (isNaN(unlockDateObj.getTime())) {
			return res.status(400).json({ error: "Invalid unlock date" });
		}

		if (unlockDateObj <= new Date()) {
			return res
				.status(400)
				.json({ error: "Unlock date must be in the future" });
		}

		bucket.lockSettings = {
			enabled: true,
			unlockDate: unlockDateObj,
			lockedAt: new Date(),
			originalTargetAmount: bucket.targetAmount,
		};

		bucket.updatedAt = new Date();
		await bucket.save();

		// Stop auto-save for locked bucket
		if (scheduledJobs.has(bucket._id)) {
			scheduledJobs.get(bucket._id).stop();
			scheduledJobs.delete(bucket._id);
			console.log(`Auto-save stopped for locked bucket ${bucket._id}`);
		}

		res.json({
			success: true,
			message: `Bucket locked until ${unlockDateObj.toLocaleDateString()}`,
			bucket,
		});
	} catch (err) {
		console.error("Lock bucket error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Unlock a bucket (can only be done on or after unlock date)
export const unlockBucket = async (req, res) => {
	try {
		const { id } = req.params;

		const bucket = await SavingsBucket.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!bucket) {
			return res.status(404).json({ error: "Bucket not found" });
		}

		if (!bucket.lockSettings.enabled) {
			return res.status(400).json({ error: "Bucket is not locked" });
		}

		const now = new Date();
		if (now < bucket.lockSettings.unlockDate) {
			const daysRemaining = Math.ceil(
				(bucket.lockSettings.unlockDate - now) / (1000 * 60 * 60 * 24),
			);
			return res.status(400).json({
				error: `Bucket is still locked. Unlock date: ${bucket.lockSettings.unlockDate.toLocaleDateString()} (${daysRemaining} days remaining)`,
			});
		}

		bucket.lockSettings = {
			enabled: false,
			unlockDate: null,
			lockedAt: null,
			originalTargetAmount: null,
		};

		bucket.updatedAt = new Date();
		await bucket.save();

		// Resume auto-save if it was enabled
		if (
			bucket.topUpSchedule.autoSaveEnabled &&
			bucket.currentAmount < bucket.targetAmount
		) {
			scheduleAutoSave(
				bucket._id,
				bucket.userId,
				bucket.topUpSchedule.frequency,
				bucket.topUpSchedule.amount,
			);
		}

		res.json({
			success: true,
			message: "Bucket unlocked successfully",
			bucket,
		});
	} catch (err) {
		console.error("Unlock bucket error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Credit a bucket (manual deposit)
export const creditBucket = async (req, res) => {
	try {
		const { id } = req.params;
		const { amount } = req.body;

		if (amount <= 0) {
			return res.status(400).json({ error: "Invalid amount" });
		}

		const bucket = await SavingsBucket.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!bucket) {
			return res.status(404).json({ error: "Bucket not found" });
		}

		// Check if bucket is locked
		if (bucket.isLocked) {
			return res.status(403).json({
				error: `Bucket is locked until ${bucket.lockSettings.unlockDate.toLocaleDateString()}. Cannot add funds to locked bucket.`,
			});
		}

		const wallet = await Wallet.findOne({ userId: req.user._id });
		if (!wallet) {
			return res.status(404).json({ error: "Wallet not found" });
		}

		// Log current balances
		console.log("Current wallet balance:", wallet.balance);
		console.log("Current bucket amount:", bucket.currentAmount);
		console.log("Amount to add:", amount);

		if (wallet.balance < amount) {
			return res.status(400).json({ error: "Insufficient wallet balance" });
		}

		// Check if adding this amount would exceed target
		const newAmount = bucket.currentAmount + amount;
		if (newAmount > bucket.targetAmount) {
			return res.status(400).json({
				error: `This deposit would exceed your target. You can only add ${bucket.targetAmount - bucket.currentAmount} more.`,
			});
		}

		// Deduct from wallet
		wallet.balance -= amount;
		await wallet.save();

		// Credit the bucket
		bucket.currentAmount += amount;
		await bucket.save();

		const isCompleted = bucket.currentAmount >= bucket.targetAmount;

		await sendSavingNotification(
			req.user._id,
			bucket.name,
			bucket.currentAmount,
			bucket.targetAmount,
			isCompleted ? "completed" : "updated",
		);

		// Get the updated wallet to ensure we have the latest balance
		const updatedWallet = await Wallet.findOne({ userId: req.user._id });

		console.log("Updated wallet balance:", updatedWallet.balance);
		console.log("Updated bucket amount:", bucket.currentAmount);

		// Check if bucket is completed
		if (bucket.currentAmount >= bucket.targetAmount) {
			// Stop auto-save if completed
			if (scheduledJobs.has(bucket._id)) {
				scheduledJobs.get(bucket._id).stop();
				scheduledJobs.delete(bucket._id);
				console.log(`Auto-save stopped for completed bucket ${bucket._id}`);
			}
		}

		res.json({
			success: true,
			bucket,
			wallet: {
				_id: updatedWallet._id,
				balance: updatedWallet.balance,
				allocated: updatedWallet.allocated || 0,
				available: updatedWallet.balance - (updatedWallet.allocated || 0),
			},
			message: "Deposit successful",
		});
	} catch (err) {
		console.error("Credit bucket error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Withdraw from bucket with penalty for locked buckets
export const withdrawFromBucket = async (req, res) => {
	try {
		const { id } = req.params;
		const { amount } = req.body;

		if (!amount || amount <= 0) {
			return res.status(400).json({ error: "Invalid withdrawal amount" });
		}

		const bucket = await SavingsBucket.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!bucket) {
			return res.status(404).json({ error: "Bucket not found" });
		}

		if (bucket.currentAmount < amount) {
			return res.status(400).json({ error: "Insufficient funds in bucket" });
		}

		let wallet = await Wallet.findOne({ userId: req.user._id });
		if (!wallet) {
			return res.status(404).json({ error: "Wallet not found" });
		}

		let penalty = 0;
		let amountToWithdraw = amount;
		let penaltyMessage = "";

		// Check if bucket is locked and withdrawal is being made before unlock date
		if (bucket.isLocked && !bucket.canWithdrawEarly) {
			// Calculate the maximum amount the user can withdraw considering penalty
			// Formula: amount + (amount * 0.2) = total_deduction <= bucket.currentAmount
			// So: amount * 1.2 <= bucket.currentAmount
			// Therefore: amount <= bucket.currentAmount / 1.2

			const maxWithdrawable = Math.floor(bucket.currentAmount / 1.07);

			if (amount > maxWithdrawable) {
				return res.status(400).json({
					error: `With this locked bucket, you can only withdraw up to ₦${maxWithdrawable} (₦${(maxWithdrawable * 0.2).toFixed(2)} penalty will be applied). You requested ₦${amount}.`,
					maxWithdrawable,
					penaltyRate: "7%",
				});
			}

			const penaltyDetails = bucket.calculatePenalty(amount);
			penalty = penaltyDetails.penalty;
			totalDeduction = penaltyDetails.totalDeduction;
			penaltyMessage = ` Early withdrawal penalty (7%): ₦${penalty.toFixed(2)} applied.`;

			console.log(`Locked bucket penalty: ₦${penalty}`);
		}

		// Deduct total amount (withdrawal amount + penalty) from bucket
		bucket.currentAmount -= amountToWithdraw;
		await bucket.save();

		// Credit wallet with only the withdrawal amount (penalty goes to platform)
		wallet.balance += amount;
		await wallet.save();

		// Create penalty transaction if applicable
		if (penalty > 0) {
			await Transaction.create({
				walletId: wallet._id,
				userId: req.user._id,
				transactionId: `PENALTY-${bucket._id}-${Date.now()}`,
				type: "expense",
				amount: penalty,
				status: "Completed",
				description: `Early withdrawal penalty for bucket: ${bucket.name}`,
				source: "penalty",
				metadata: {
					bucketId: bucket._id,
					bucketName: bucket.name,
					withdrawAmount: amount,
					penaltyAmount: penalty,
					penaltyMultiplier: 1.07,
				},
			});
		}

		const updatedWallet = await Wallet.findOne({ userId: req.user._id });

		res.status(200).json({
			success: true,
			message: `Withdrawal successful.${penaltyMessage}`,
			bucket,
			wallet: {
				_id: updatedWallet._id,
				balance: updatedWallet.balance,
				allocated: updatedWallet.allocated || 0,
				available: updatedWallet.balance - (updatedWallet.allocated || 0),
			},
			withdrawAmount: amount,
			penaltyApplied: penalty,
			totalDeductedFromBucket: amountToWithdraw,
		});
	} catch (err) {
		console.error("Withdraw from bucket error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Get bucket statistics with lock info
export const getBucketStats = async (req, res) => {
	try {
		const { id } = req.params;
		const bucket = await SavingsBucket.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!bucket) {
			return res.status(404).json({ error: "Bucket not found" });
		}

		const progress = (bucket.currentAmount / bucket.targetAmount) * 100;
		const remaining = bucket.targetAmount - bucket.currentAmount;

		let lockInfo = {
			isLocked: bucket.isLocked,
			enabled: bucket.lockSettings.enabled,
			unlockDate: bucket.lockSettings.unlockDate,
			lockedAt: bucket.lockSettings.lockedAt,
			canWithdrawEarly: bucket.canWithdrawEarly,
		};

		if (bucket.isLocked && !bucket.canWithdrawEarly) {
			const now = new Date();
			const daysRemaining = Math.ceil(
				(bucket.lockSettings.unlockDate - now) / (1000 * 60 * 60 * 24),
			);
			lockInfo.daysRemaining = daysRemaining;
			lockInfo.penaltyMultiplier = 1.07;
		}

		res.json({
			success: true,
			stats: {
				id: bucket._id,
				name: bucket.name,
				targetAmount: bucket.targetAmount,
				currentAmount: bucket.currentAmount,
				progress: Math.min(progress, 100),
				remaining: remaining,
				completed: bucket.currentAmount >= bucket.targetAmount,
				autoSaveEnabled: bucket.topUpSchedule.autoSaveEnabled,
				autoSaveFrequency: bucket.topUpSchedule.frequency,
				autoSaveAmount: bucket.topUpSchedule.amount,
				lockInfo,
			},
		});
	} catch (err) {
		console.error("Get bucket stats error:", err);
		res.status(500).json({ error: err.message });
	}
};
