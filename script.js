// --- Local Storage Keys (still used for logged-in username for quick checks, but main data is in Supabase) ---
const LS_LOGGED_IN_USER_KEY = 'smartDustbinLoggedInUser'; // Stores username of logged-in user

// --- Supabase Configuration ---
// Replace with your actual Supabase project URL and Anon key
const SUPABASE_URL = 'https://ynqlxqqeprgxjjusihlg.supabase.co'; // e.g., 'https://xyzabcdefg.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlucWx4cXFlcHJneGpqdXNpaGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NTczMTEsImV4cCI6MjA2OTQzMzMxMX0.CtRdrVjnyy7atnFPwVGAhwpF08yDt-VDmVbJ8gnrVKM'; // e.g., 'eyJ...your_anon_key...asdf'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Global Variables ---
let currentUser = null; // Stores the currently logged-in user's data from our 'profiles' table
let html5QrCodeScanner = null; // Html5Qrcode instance
let isScannerActive = false; // Flag to track scanner state

// ✅ IMPORTANT: Define the exact content of your 'frame.png' QR code.
//    This is the string that Google Lens (or any scanner) shows.
//    YOU MUST ENSURE THIS MATCHES EXACTLY!
const EXPECTED_FRAME_QR_CONTENT = 'https://qrco.de/bgBWbc';

// Define the cooldown period in milliseconds (5 minutes = 5 * 60 * 1000)
const QR_SCAN_COOLDOWN_MS = 5 * 60 * 1000;


// Default coupons (hardcoded for standalone frontend)
const defaultCoupons = [
    { id: 'coupon1', name: '10% Off at Green Mart', points: 100 },
    { id: 'coupon2', name: 'Free Coffee at EcoCafe', points: 50 },
    { id: 'coupon3', name: '20% Off Recycled Clothing', points: 200 },
    { id: 'coupon4', name: 'Free Plant Seedling', points: 75 },
    { id: 'coupon5', name: '15% Off Solar Gadgets', points: 150 },
    { id: 'coupon6', name: 'Free Eco-Bag', points: 30 },
    { id: 'coupon7', name: '25% Off Organic Food', points: 180 },
    { id: 'coupon8', name: 'Free Bike Tune-up', points: 120 },
    { id: 'coupon9', name: '30% Off Green Energy', points: 300 },
    { id: 'coupon10', name: 'Free Composting Kit', points: 90 }
];

// --- UI Element References ---
const appDiv = document.getElementById('app');
const authModal = document.getElementById('authModal');
const loadingOverlay = document.getElementById('loadingOverlay');
const toastContainer = document.getElementById('toastContainer');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// --- Core Functions ---

/**
 * Initializes the application.
 */
async function initApp() {
    console.log("Smart Dust Bin App Initializing...");
    setupEventListeners(); // Setup form submissions and other UI interactions
    await checkLoginStatus(); // Check if a user is already logged in with Supabase
    showPage('dashboard'); // Always start on the dashboard
}

/**
 * Checks if a user is logged in with Supabase and loads their profile.
 * @returns {boolean} True if a user is logged in, false otherwise.
 */
async function checkLoginStatus() {
    showLoading();
    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            // Fetch user's profile from your 'profiles' table
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profileError) throw profileError;

            currentUser = profile;
            // Ensure scannedQRCodes is initialized with structure if not present
            if (!currentUser.scannedQRCodes) {
                currentUser.scannedQRCodes = [];
            }
            updateUI(); // Update UI with logged-in user data
            authModal.style.display = 'none'; // Hide modal if logged in
            console.log(`User '${currentUser.username}' logged in.`);
            return true;
        } else {
            currentUser = null;
            authModal.style.display = 'flex'; // Show login modal if not logged in
            console.log("No user logged in. Showing login modal.");
            return false;
        }
    } catch (error) {
        console.error("Error checking login status:", error.message);
        showToast("Error checking login status.", "error");
        currentUser = null;
        authModal.style.display = 'flex';
        return false;
    } finally {
        hideLoading();
    }
}


/**
 * Sets up event listeners for login and register forms.
 */
function setupEventListeners() {
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
}

/**
 * Handles user login.
 * @param {Event} event The submit event from the login form.
 */
async function handleLogin(event) {
    event.preventDefault();
    showLoading();

    const email = document.getElementById('loginEmail').value; // Changed to email for Supabase auth
    const password = document.getElementById('loginPassword').value;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        // Fetch user profile after successful authentication
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

        if (profileError) throw profileError;

        currentUser = profile;
        if (!currentUser.scannedQRCodes) {
            currentUser.scannedQRCodes = [];
        }
        updateUI();
        authModal.style.display = 'none';
        showToast('Login successful!', 'success');
        console.log("User logged in:", currentUser.username);
        showPage('dashboard');
    } catch (error) {
        showToast(`Login failed: ${error.message}`, 'error');
        console.error("Login failed:", error.message);
    } finally {
        hideLoading();
    }
}

/**
 * Handles user registration.
 * @param {Event} event The submit event from the register form.
 */
async function handleRegister(event) {
    event.preventDefault();
    showLoading();

    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    try {
        // First, check if username already exists in your profiles table
        const { data: existingUsernames, error: usernameCheckError } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username);

        if (usernameCheckError) throw usernameCheckError;
        if (existingUsernames && existingUsernames.length > 0) {
            showToast('Username already exists. Please choose a different one.', 'error');
            hideLoading();
            return;
        }

        // Register user with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (error) throw error;

        // If signup is successful, create a profile entry in your 'profiles' table
        const newUserProfile = {
            id: data.user.id, // Link to Supabase Auth user ID
            username: username,
            email: email,
            points: 100, // Welcome bonus
            points_history: [{ action: 'welcome_bonus', points: 100, description: 'Welcome bonus', timestamp: new Date().toISOString() }],
            redeemed_coupons: [],
            scanned_qrcodes: []
        };

        const { error: profileInsertError } = await supabase
            .from('profiles')
            .insert([newUserProfile]);

        if (profileInsertError) {
            // If profile creation fails, you might want to consider deleting the auth user
            console.error("Error creating user profile:", profileInsertError.message);
            await supabase.auth.admin.deleteUser(data.user.id); // Admin API for deletion
            throw new Error("Failed to create user profile after registration.");
        }

        currentUser = newUserProfile;
        updateUI();
        authModal.style.display = 'none';
        showToast('Registration successful! Welcome bonus added.', 'success');
        console.log("New user registered and profile created:", username);
        showPage('dashboard');
    } catch (error) {
        showToast(`Registration failed: ${error.message}`, 'error');
        console.error("Registration failed:", error.message);
    } finally {
        hideLoading();
    }
}

/**
 * Logs out the current user.
 */
async function logout() {
    showLoading();
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        currentUser = null;
        showToast('Logged out successfully!', 'info');
        updateUI(); // Reset UI to guest state
        authModal.style.display = 'flex'; // Show login modal
        showPage('dashboard'); // Go back to dashboard (will show guest view)
        console.log("User logged out.");
    } catch (error) {
        showToast(`Logout failed: ${error.message}`, 'error');
        console.error("Logout failed:", error.message);
    } finally {
        hideLoading();
    }
}

/**
 * Updates the UI elements with current user data.
 */
function updateUI() {
    const user = currentUser || { username: 'Guest', points: 0, points_history: [], redeemed_coupons: [], scanned_qrcodes: [] };

    document.getElementById('userName').innerText = user.username;
    document.getElementById('userPoints').innerText = user.points;
    document.getElementById('totalPoints').innerText = user.points;

    // Update dashboard stats - ensure using correct property names from Supabase profile
    document.getElementById('totalScans').innerText = (user.points_history || []).filter(item => item.action === 'qr_scan').length;
    document.getElementById('totalRedeemed').innerText = (user.redeemed_coupons || []).length;

    renderRecentActivity(user.points_history || []);
    renderPointsHistory(user.points_history || [], user.redeemed_coupons || []);
}

// --- Navigation and Page Management (No changes needed here for Supabase integration) ---

/**
 * Shows a specific page and hides others.
 * @param {string} pageId The ID of the page to show (e.g., 'dashboard', 'scan').
 */
function showPage(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId + 'Page').classList.add('active');

    // Close mobile navigation if open
    document.getElementById('navLinks').classList.remove('active');

    // Perform page-specific actions
    // Stop scanner if navigating away from scan page
    if (pageId !== 'scan' && isScannerActive) {
        stopScanner();
    }
    // Load data for the active page
    if (currentUser) { // Only load data if a user is logged in
        if (pageId === 'dashboard') {
            updateUI(); // Refresh dashboard stats
        } else if (pageId === 'coupons') {
            loadCoupons();
        } else if (pageId === 'history') {
            // History is updated by updateUI, but ensure it's loaded
            updateUI();
        }
    }
}

/**
 * Toggles the mobile navigation menu.
 */
function toggleNav() {
    document.getElementById('navLinks').classList.toggle('active');
}

/**
 * Switches between login and register forms in the modal.
 * @param {string} tab The tab to activate ('login' or 'register').
 */
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));

    document.querySelector(`.tab-btn[onclick="switchTab('${tab}')"]`).classList.add('active');
    document.getElementById(`${tab}Form`).classList.add('active');
}


// --- QR Scanner Functionality ---

/**
 * Initializes and starts the QR scanner.
 */
async function startScanner() {
    if (!currentUser) {
        showToast("Please log in to use the QR scanner.", "warning");
        authModal.style.display = 'flex'; // Show login modal
        return;
    }
    if (isScannerActive) {
        showToast("Scanner is already running.", "info");
        return;
    }

    isScannerActive = true;
    document.getElementById('startScanBtn').style.display = 'none';
    document.getElementById('stopScanBtn').style.display = 'block';
    document.getElementById('qr-reader').innerHTML = ''; // Clear previous scanner content
    document.getElementById('qr-reader').style.display = 'block'; // Ensure scanner div is visible

    html5QrCodeScanner = new Html5Qrcode("qr-reader");

    try {
        await html5QrCodeScanner.start(
            { facingMode: "environment" }, // Prioritize rear camera
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            (decodedText, decodedResult) => {
                // Only process if scanner is still active
                if (isScannerActive) {
                    console.log(`QR code detected: ${decodedText}`);
                    handleQRScan(decodedText);
                }
            },
            (errorMessage) => {
                // console.warn(`QR Scan error: ${errorMessage}`); // Suppress for cleaner console
            }
        );
        showToast("Scanner started. Point camera at QR.", "info");
        console.log("QR scanner initialized and started.");
    } catch (err) {
        isScannerActive = false;
        document.getElementById('startScanBtn').style.display = 'block';
        document.getElementById('stopScanBtn').style.display = 'none';
        document.getElementById('qr-reader').style.display = 'none';
        showToast("Failed to start camera. Please check permissions.", "error");
        console.error("Failed to start QR scanner:", err);
    }
}

/**
 * Stops the QR scanner.
 */
async function stopScanner() {
    if (html5QrCodeScanner && isScannerActive) {
        try {
            await html5QrCodeScanner.stop();
            html5QrCodeScanner.clear(); // Clear resources
            isScannerActive = false;
            document.getElementById('startScanBtn').style.display = 'block';
            document.getElementById('stopScanBtn').style.display = 'none';
            document.getElementById('qr-reader').innerHTML = ''; // Clear view
            document.getElementById('qr-reader').style.display = 'none'; // Hide scanner div
            showToast("Scanner stopped.", "info");
            console.log("QR scanner stopped.");
        } catch (err) {
            console.error("Error stopping QR scanner:", err);
            showToast("Error stopping scanner.", "error");
        }
    }
}

/**
 * Handles the logic after a QR code is successfully scanned.
 * @param {string} decodedText The text content of the scanned QR code.
 */
async function handleQRScan(decodedText) {
    if (!isScannerActive || !currentUser) return; // Ensure active scanner and logged-in user

    await stopScanner(); // Stop scanner immediately after a successful scan
    showLoading();

    try {
        // ✅ Crucial Modification: ONLY allow the specific 'frame.png' QR content
        if (decodedText !== EXPECTED_FRAME_QR_CONTENT) {
            showToast("This is not the valid dust bin QR code. Please scan the correct one.", "error");
            console.warn(`Scanned QR content '${decodedText}' does not match expected QR content '${EXPECTED_FRAME_QR_CONTENT}'.`);
            return;
        }
        // If the code reaches here, it means decodedText === EXPECTED_FRAME_QR_CONTENT

        // Use the expected content as the unique ID for tracking purposes
        const qrIdForTracking = EXPECTED_FRAME_QR_CONTENT;

        // --- Logic for QR scanning with Supabase ---
        let userProfile = currentUser; // Use the current user's profile data
        const currentTime = Date.now();

        // Ensure scanned_qrcodes is an array, if it's null/undefined
        if (!userProfile.scanned_qrcodes) {
            userProfile.scanned_qrcodes = [];
        }

        // Find if this specific QR code has been scanned before by this user
        const scannedQrEntry = userProfile.scanned_qrcodes.find(entry => entry.qrId === qrIdForTracking);

        if (scannedQrEntry) {
            const timeSinceLastScan = currentTime - scannedQrEntry.lastScannedAt;

            if (timeSinceLastScan < QR_SCAN_COOLDOWN_MS) {
                const remainingTimeMs = QR_SCAN_COOLDOWN_MS - timeSinceLastScan;
                const remainingMinutes = Math.ceil(remainingTimeMs / (1000 * 60));
                showToast(`You have already scanned this QR code recently. Please wait ${remainingMinutes} more minute(s).`, "warning");
                console.warn(`Expected QR content '${qrIdForTracking}' already scanned by ${currentUser.username} and still on cooldown.`);
                return;
            } else {
                scannedQrEntry.lastScannedAt = currentTime; // Update timestamp
                showToast("QR code re-scanned after cooldown!", "success");
            }
        } else {
            userProfile.scanned_qrcodes.push({
                qrId: qrIdForTracking,
                lastScannedAt: currentTime
            });
            showToast("First scan successful!", "success");
        }

        const pointsEarned = 1000;
        userProfile.points += pointsEarned;
        userProfile.points_history.push({
            action: 'qr_scan',
            points: pointsEarned,
            description: `Scanned Dust Bin QR (${qrIdForTracking.substring(0, 30)}...)`,
            timestamp: new Date().toISOString()
        });

        // Update the user's profile in Supabase
        const { error } = await supabase
            .from('profiles')
            .update({
                points: userProfile.points,
                points_history: userProfile.points_history,
                scanned_qrcodes: userProfile.scanned_qrcodes
            })
            .eq('id', currentUser.id);

        if (error) throw error;

        currentUser = userProfile; // Update global currentUser with the latest data
        showToast(`+${pointsEarned} points added!`, 'success');
        console.log(`Successfully scanned QR '${qrIdForTracking}'. Points earned: ${pointsEarned}, Total points: ${currentUser.points}`);
        updateUI();

    } catch (error) {
        showToast(`Error processing QR scan: ${error.message}`, 'error');
        console.error("QR Scan processing error:", error);
    } finally {
        hideLoading();
    }
}

/**
 * Generates a demo QR code for testing purposes.
 * This function will now generate QRs that either match EXPECTED_FRAME_QR_CONTENT
 * or a similar but different URL to demonstrate rejection.
 */
async function generateDemoQR() {
    showLoading();
    try {
        const demoQRContainer = document.getElementById('demoQRContainer');
        demoQRContainer.innerHTML = ''; // Clear previous QR

        // 20% chance to generate the EXPECTED_FRAME_QR_CONTENT for testing the successful path
        const isExpectedQrTime = Math.random() < 0.2;
        const qrContentToGenerate = isExpectedQrTime
            ? EXPECTED_FRAME_QR_CONTENT
            : `https://dustbin-reward.com/test_user_${Date.now()}`; // A different URL for testing rejection

        // Points for demo QR (fixed at 10 for consistency)
        const pointsForDemo = 10;

        // Using qrcode.js library to generate QR code on client side
        // Make sure qrcode.js is included in your HTML
        // <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        new QRCode(demoQRContainer, {
            text: qrContentToGenerate,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `<p>Scan this QR to add points!</p>
                             <p style="font-size:0.8em; color:#666;">(Content: ${qrContentToGenerate.substring(0, 35)}...)</p>
                             <p style="font-size:0.9em; font-weight:bold; color: ${isExpectedQrTime ? 'green' : 'orange'};">
                                 ${isExpectedQrTime ? 'This is the *correct* Dust Bin QR!' : 'This is a *test* QR (will be rejected).'}
                             </p>`;
        demoQRContainer.appendChild(infoDiv);

        showToast("Demo QR generated! Scan it.", "info");
        console.log(`Demo QR generated: ${qrContentToGenerate}. Points reflected: ${pointsForDemo}.`);

    } catch (error) {
        showToast("Error generating demo QR.", "error");
        console.error("Error generating demo QR:", error);
    } finally {
        hideLoading();
    }
}


// --- Coupons ---

/**
 * Loads and displays available coupons.
 */
function loadCoupons() {
    const couponsGrid = document.getElementById('couponsGrid');
    couponsGrid.innerHTML = ''; // Clear previous coupons

    if (defaultCoupons.length === 0) {
        couponsGrid.innerHTML = '<p class="info-message">No coupons available at the moment. Check back later!</p>';
        return;
    }

    defaultCoupons.forEach(coupon => {
        const couponCard = document.createElement('div');
        couponCard.className = 'card coupon-card';

        // Check if user is logged in AND has enough points to redeem
        const canRedeem = currentUser && currentUser.points >= coupon.points;
        const buttonDisabled = canRedeem ? '' : 'disabled';
        let buttonText = 'Redeem Now';
        if (!currentUser) {
            buttonText = 'Login to Redeem';
        } else if (!canRedeem) {
            buttonText = 'Insufficient Points';
        }

        couponCard.innerHTML = `
            <div class="coupon-header">
                <div class="coupon-name">${coupon.name}</div>
                <div class="coupon-points"><i class="fas fa-coins"></i> ${coupon.points} Points</div>
            </div>
            <div class="coupon-body">
                <p class="coupon-description">Redeem for exclusive eco-friendly benefits!</p>
                <button class="coupon-btn" onclick="redeemCoupon('${coupon.id}', ${coupon.points})" ${buttonDisabled}>
                    ${buttonText}
                </button>
            </div>
        `;
        couponsGrid.appendChild(couponCard);
    });
    console.log("Coupons loaded and rendered.");
}

/**
 * Redeems a selected coupon.
 * @param {string} couponId The ID of the coupon to redeem.
 * @param {number} pointsRequired The points required for this coupon.
 */
async function redeemCoupon(couponId, pointsRequired) {
    if (!currentUser) {
        showToast("Please log in to redeem coupons.", "warning");
        authModal.style.display = 'flex'; // Show login modal
        return;
    }
    if (currentUser.points < pointsRequired) {
        showToast("Insufficient points to redeem this coupon!", "warning");
        return;
    }

    showLoading();
    try {
        let userProfile = currentUser; // Use the current user's profile data

        const coupon = defaultCoupons.find(c => c.id === couponId);
        if (!coupon) {
            showToast("Coupon not found.", "error");
            return;
        }

        userProfile.points -= coupon.points;
        userProfile.redeemed_coupons.push({ // Use `redeemed_coupons` as per Supabase table
            coupon_id: coupon.id,
            coupon_name: coupon.name,
            points_used: coupon.points,
            redeemed_at: new Date().toISOString()
        });
        userProfile.points_history.push({ // Use `points_history` as per Supabase table
            action: 'coupon_redeem',
            points: -coupon.points, // Store as negative for history
            description: `Redeemed ${coupon.name}`,
            timestamp: new Date().toISOString()
        });

        // Update the user's profile in Supabase
        const { error } = await supabase
            .from('profiles')
            .update({
                points: userProfile.points,
                points_history: userProfile.points_history,
                redeemed_coupons: userProfile.redeemed_coupons
            })
            .eq('id', currentUser.id);

        if (error) throw error;

        currentUser = userProfile; // Update global currentUser with the latest data
        showToast(`Coupon "${coupon.name}" redeemed!`, "success");
        console.log(`Coupon '${coupon.name}' redeemed by ${currentUser.username}. Remaining points: ${currentUser.points}`);
        updateUI(); // Refresh UI with new points and history
        loadCoupons(); // Re-render coupons to update button states
    } catch (error) {
        showToast(`Error during coupon redemption: ${error.message}`, "error");
        console.error("Error redeeming coupon:", error);
    } finally {
        hideLoading();
    }
}

// --- History ---

/**
 * Renders the full points history and redeemed coupons.
 * This is called by updateUI to ensure all history data is fresh.
 */
function renderPointsHistory(historyData, redeemedData) {
    const pointsHistoryDiv = document.getElementById('pointsHistory');
    pointsHistoryDiv.innerHTML = ''; // Clear existing history

    // Ensure currentUser and its history/redeemed properties are available
    if (!currentUser || (!currentUser.points_history && !currentUser.redeemed_coupons)) {
        pointsHistoryDiv.innerHTML = '<p class="info-message">No activity found yet. Start recycling!</p>';
        return;
    }

    const allActivities = [
        ...(historyData || []).map(item => ({
            type: 'points',
            ...item
        })),
        ...(redeemedData || []).map(item => ({
            type: 'redeem',
            timestamp: item.redeemed_at,
            points: -item.points_used,
            description: `Redeemed ${item.coupon_name}`,
            action: 'coupon_redeem'
        }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Sort descending

    if (allActivities.length === 0) {
        pointsHistoryDiv.innerHTML = '<p class="info-message">No activity found yet. Start recycling!</p>';
        return;
    }

    allActivities.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';

        let iconClass = '';
        let pointsText = '';
        let pointsClass = '';

        if (item.type === 'points') {
            if (item.action === 'qr_scan') {
                iconClass = 'fas fa-trash-restore-alt'; // or 'fa-qrcode'
                pointsClass = 'positive';
                pointsText = `+${item.points}`;
            } else if (item.action === 'welcome_bonus') {
                iconClass = 'fas fa-trophy';
                pointsClass = 'positive';
                pointsText = `+${item.points}`;
            }
            // Add other point earning actions here if any
        } else if (item.type === 'redeem') {
            iconClass = 'fas fa-gift';
            pointsClass = 'negative';
            pointsText = `${item.points}`; // Item.points is already negative for redeemed
        }

        historyItem.innerHTML = `
            <div class="history-icon ${item.action === 'qr_scan' ? 'scan' : (item.action === 'coupon_redeem' ? 'redeem' : 'bonus')}">
                <i class="${iconClass}"></i>
            </div>
            <div class="history-details">
                <div class="history-description">${item.description}</div>
                <div class="history-time">${new Date(item.timestamp).toLocaleString()}</div>
            </div>
            <div class="history-points ${pointsClass}">${pointsText}</div>
        `;
        pointsHistoryDiv.appendChild(historyItem);
    });
    console.log("Points history and redeemed coupons rendered.");
}

/**
 * Renders recent activity for the dashboard (usually a subset of the full history).
 */
function renderRecentActivity(historyData) {
    const recentActivityDiv = document.getElementById('recentActivity');
    recentActivityDiv.innerHTML = ''; // Clear previous activity

    if (!currentUser || (!currentUser.points_history && !currentUser.redeemed_coupons)) {
        recentActivityDiv.innerHTML = '<p class="info-message">No recent activity. Start recycling!</p>';
        return;
    }

    // Combine history and redeemed, then sort to get genuinely recent activities
    const allActivities = [
        ...(historyData || []).map(item => ({
            type: 'points',
            ...item
        })),
        ...(currentUser.redeemed_coupons || []).map(item => ({ // Include redeemed coupons
            type: 'redeem',
            timestamp: item.redeemed_at,
            points: -item.points_used,
            description: `Redeemed ${item.coupon_name}`,
            action: 'coupon_redeem'
        }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Sort descending by timestamp


    // Take the most recent 5 activities
    const recentItems = allActivities.slice(0, 5);

    if (recentItems.length === 0) {
        recentActivityDiv.innerHTML = '<p class="info-message">No recent activity. Start recycling!</p>';
        return;
    }

    recentItems.forEach(item => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';

        let iconClass = '';
        let pointsText = '';
        let pointsClass = '';

        if (item.action === 'qr_scan') {
            iconClass = 'fas fa-qrcode'; // QR scan
            pointsClass = 'positive';
            pointsText = `+${item.points}`;
        } else if (item.action === 'coupon_redeem') {
            iconClass = 'fas fa-gift'; // Coupon redemption
            pointsClass = 'negative';
            pointsText = `${item.points}`; // Points are already negative for redeemed
        } else if (item.action === 'welcome_bonus') {
            iconClass = 'fas fa-star'; // Welcome bonus
            pointsClass = 'positive';
            pointsText = `+${item.points}`;
        }

        activityItem.innerHTML = `
            <div class="activity-icon ${item.action === 'qr_scan' ? 'scan' : (item.action === 'coupon_redeem' ? 'redeem' : 'bonus')}">
                <i class="${iconClass}"></i>
            </div>
            <div class="activity-details">
                <div class="activity-description">${item.description}</div>
                <div class="activity-time">${new Date(item.timestamp).toLocaleString()}</div>
            </div>
            <div class="activity-points ${pointsClass}">${pointsText}</div>
        `;
        recentActivityDiv.appendChild(activityItem);
    });
    console.log("Recent activities rendered.");
}

// --- Loading and Toast Notifications (No changes needed here) ---

/**
 * Shows the loading overlay.
 */
function showLoading() {
    loadingOverlay.classList.add('active');
}

/**
 * Hides the loading overlay.
 */
function hideLoading() {
    loadingOverlay.classList.remove('active');
}

/**
 * Displays a toast notification.
 * @param {string} message The message to display.
 * @param {'success'|'error'|'info'|'warning'} type The type of toast (for styling and icon).
 */
function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = '';
    if (type === 'success') icon = '<i class="fas fa-check-circle toast-icon"></i>';
    else if (type === 'error') icon = '<i class="fas fa-times-circle toast-icon"></i>';
    else if (type === 'info') icon = '<i class="fas fa-info-circle toast-icon"></i>';
    else if (type === 'warning') icon = '<i class="fas fa-exclamation-triangle toast-icon"></i>';

    toast.innerHTML = `${icon}<span>${message}</span>`;
    toastContainer.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000); // Hide after 3 seconds
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', initApp);

// Expose functions to global scope for HTML onclick attributes
window.showPage = showPage;
window.toggleNav = toggleNav;
window.logout = logout;
window.startScanner = startScanner;
window.stopScanner = stopScanner;
window.generateDemoQR = generateDemoQR;
window.redeemCoupon = redeemCoupon;
window.switchTab = switchTab; // For the modal tabs

// Supabase client creation
function createClient(supabaseUrl, supabaseAnonKey) {
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Supabase URL or Anon Key is missing. Please set them in the code.");
        showToast("Supabase configuration error. See console.", "error");
        return {
            auth: {
                getUser: async () => ({ data: { user: null }, error: new Error('Supabase not configured') }),
                signInWithPassword: async () => ({ error: new Error('Supabase not configured') }),
                signUp: async () => ({ error: new Error('Supabase not configured') }),
                signOut: async () => ({ error: new Error('Supabase not configured') }),
                admin: {
                    deleteUser: async () => ({ error: new Error('Supabase not configured') })
                }
            },
            from: () => ({
                select: () => ({ eq: () => ({ single: () => ({ data: null, error: new Error('Supabase not configured') }) }) }),
                insert: () => ({ error: new Error('Supabase not configured') }),
                update: () => ({ eq: () => ({ error: new Error('Supabase not configured') }) })
            })
        };
    }
    return Supabase.createClient(supabaseUrl, supabaseAnonKey);
}