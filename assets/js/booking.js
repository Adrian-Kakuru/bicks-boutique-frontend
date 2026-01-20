/**
 * Booking Flow Controller
 */

console.log('Booking.js loaded');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing Booking.js');

    // State
    const state = {
        checkIn: '',
        checkOut: '',
        guests: 2,
        selectedRoom: null,
        availableRooms: [],
        bookingId: null, // Track current booking
        payLink: null    // Track current link
    };

    // DOM Elements
    const elements = {
        step1: document.getElementById('step-1'),
        step2: document.getElementById('step-2'),
        step3: document.getElementById('step-3'),
        step4: document.getElementById('step-4'),
        stepVerifying: document.getElementById('step-verifying'), // New Step 4.5
        step5: document.getElementById('step-5'),             // Success
        stepError: document.getElementById('step-error'),     // Failure
        progressBar: document.querySelector('.progress-bar'),

        // Step 1 Inputs
        checkInInput: document.getElementById('checkIn'),
        checkOutInput: document.getElementById('checkOut'),
        guestsInput: document.getElementById('guests'),
        searchBtn: document.getElementById('searchAvailabilityBtn'),
        dateError: document.getElementById('date-error'), // New

        // Step 2
        roomList: document.getElementById('room-list-container'),

        // Step 3
        firstName: document.getElementById('firstName'),
        lastName: document.getElementById('lastName'),
        email: document.getElementById('email'),
        phone: document.getElementById('phone'),
        confirmBtn: document.getElementById('confirmBookingBtn'),

        // Step Payment (New)
        payAmount: document.getElementById('pay-amount'),
        payNowBtn: document.getElementById('pay-now-btn'),

        // Error
        errorTitle: document.getElementById('error-title'),
        errorMessage: document.getElementById('error-message'),

        // Summary
        summaryCheckIn: document.getElementById('summary-checkIn'),
        summaryCheckOut: document.getElementById('summary-checkOut'),
        summaryRoom: document.getElementById('summary-room-name'),
        summaryTotal: document.getElementById('summary-total'),

        // Overlay
        loadingOverlay: document.getElementById('loading-overlay')
    };

    // Initialize Dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (elements.checkInInput) {
        elements.checkInInput.valueAsDate = today;
        elements.checkInInput.min = today.toISOString().split('T')[0];
    }
    if (elements.checkOutInput) {
        elements.checkOutInput.valueAsDate = tomorrow;
        elements.checkOutInput.min = tomorrow.toISOString().split('T')[0];
    }

    // --- Actions ---

    window.searchAvailability = async () => {
        // Reset Errors
        clearErrors();

        const checkIn = elements.checkInInput.value;
        const checkOut = elements.checkOutInput.value;
        const guests = elements.guestsInput.value;

        // Validation
        if (!checkIn || !checkOut) {
            showDateError('Please select both check-in and check-out dates.');
            return;
        }

        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (checkInDate < now) {
            showDateError('Check-in date cannot be in the past.');
            return;
        }

        if (checkInDate >= checkOutDate) {
            showDateError('Check-out date must be after check-in date.');
            return;
        }

        state.checkIn = checkIn;
        state.checkOut = checkOut;
        state.guests = guests;

        setLoading(true);
        try {
            const rooms = await ApiService.checkAvailability(checkIn, checkOut, guests);
            state.availableRooms = rooms;
            renderRooms(rooms);
            goToStep(2);
        } catch (error) {
            showErrorStep('Availability Search Failed', error.message);
        } finally {
            setLoading(false);
        }
    };

    window.selectRoom = (roomId) => {
        const room = state.availableRooms.find(r => r.id === roomId);
        if (!room) return;
        state.selectedRoom = room;
        updateSummary();
        goToStep(3);
    };

    window.confirmBooking = async () => {
        const guestDetails = {
            firstName: elements.firstName.value,
            lastName: elements.lastName.value,
            email: elements.email.value,
            phone: elements.phone.value
        };

        if (!guestDetails.firstName || !guestDetails.lastName || !guestDetails.email) {
            alert('Please fill in required fields.'); // Minimal alert for form, can improve later
            return;
        }

        setLoading(true);
        try {
            const bookingPayload = {
                roomTypeId: state.selectedRoom.id,
                checkIn: state.checkIn,
                checkOut: state.checkOut,
                guestDetails: guestDetails
            };

            const response = await ApiService.initiateBooking(bookingPayload);
            console.log('Booking Confirmed:', response);

            // Store for payment step
            state.bookingId = response.bookingId;
            state.payLink = response.paymentLink;

            // Go to Payment Step (Step 4)
            preparePaymentStep(state.selectedRoom.totalPrice, state.payLink);
            goToStep(4);

        } catch (error) {
            showErrorStep('Booking Failed', error.message);
        } finally {
            setLoading(false);
        }
    };

    // --- Payment Verification ---

    async function initPaymentVerification() {
        const urlParams = new URLSearchParams(window.location.search);
        const bookingId = urlParams.get('booking_id');
        const status = urlParams.get('status');
        const txRef = urlParams.get('tx_ref');

        // logic: If we have a booking_id and status/tx_ref, we are returning from payment
        if (bookingId && (status || txRef)) {
            console.log('Returning from payment provider. Verifying...', { bookingId, status });

            // Show Verifying Screen immediately
            goToStep('verifying');

            // Start Polling
            pollBookingStatus(bookingId);
        }
    }

    async function pollBookingStatus(bookingId, attempts = 0) {
        const MAX_ATTEMPTS = 10; // 30 seconds total (3s interval)
        const POLL_INTERVAL = 3000;

        try {
            const result = await ApiService.getBookingStatus(bookingId);
            console.log('Poll Result:', result);

            if (result.status === 'CONFIRMED') {
                handlePaymentSuccess();
                return;
            }

            if (result.status === 'PAYMENT_FAILED') {
                handlePaymentFailure('Payment declined or failed.');
                return;
            }

            if (result.status === 'CANCELLED') {
                handlePaymentFailure('Payment was cancelled.');
                return;
            }

            // If still AWAITING_PAYMENT, keep polling
            if (result.status === 'AWAITING_PAYMENT' && attempts < MAX_ATTEMPTS) {
                setTimeout(() => pollBookingStatus(bookingId, attempts + 1), POLL_INTERVAL);
            } else if (attempts >= MAX_ATTEMPTS) {
                // Timeout logic - unsure if failed or just delayed
                handlePaymentFailure('Verification timed out. Please check your email for confirmation or try again.');
            } else {
                // Unknown status, keep polling or fail? Let's keep polling for now or fail safe.
                setTimeout(() => pollBookingStatus(bookingId, attempts + 1), POLL_INTERVAL);
            }

        } catch (error) {
            console.error('Polling Error:', error);
            // On network error, retry a few times? Or just fail? 
            // Let's retry unless we hit max attempts
            if (attempts < MAX_ATTEMPTS) {
                setTimeout(() => pollBookingStatus(bookingId, attempts + 1), POLL_INTERVAL);
            } else {
                handlePaymentFailure('Connection error during verification. Please contact support.');
            }
        }
    }

    function handlePaymentSuccess() {
        goToStep(5);
        // Clear URL params to prevent re-verification on refresh (optional but good UX)
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    function handlePaymentFailure(reason) {
        showErrorStep('Payment Failed', reason);
        // Clear URL params
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // --- Helpers ---

    function preparePaymentStep(amount, link) {
        if (elements.payAmount) elements.payAmount.textContent = `$${amount}`;
        if (elements.payNowBtn) elements.payNowBtn.href = link;

        // Reset Error State
        const errorBox = document.getElementById('payment-error-box');
        if (errorBox) errorBox.style.display = 'none';
    }

    function showDateError(msg) {
        if (elements.dateError) {
            elements.dateError.textContent = msg;
            elements.dateError.style.display = 'block';
            elements.checkInInput.classList.add('input-error'); // Class needs CSS
        } else {
            alert(msg); // Fallback
        }
    }

    function clearErrors() {
        if (elements.dateError) elements.dateError.style.display = 'none';
        elements.checkInInput.classList.remove('input-error');
    }

    function showErrorStep(title, msg) {
        if (elements.errorTitle) elements.errorTitle.textContent = title;
        if (elements.errorMessage) elements.errorMessage.textContent = msg;
        goToStep('error');
    }

    function goToStep(stepNumber) {
        // Hide all steps
        const allSteps = [
            elements.step1, elements.step2, elements.step3,
            document.getElementById('step-4'), // Payment
            document.getElementById('step-verifying'), // Verifying
            document.getElementById('step-5'), // Success
            elements.stepError
        ];

        allSteps.forEach(el => {
            if (el) el.classList.remove('active-step');
        });

        // Show Target
        let targetId = `step-${stepNumber}`;
        if (stepNumber === 'error') targetId = 'step-error';
        if (stepNumber === 'verifying') targetId = 'step-verifying';

        const target = document.getElementById(targetId);
        if (target) target.classList.add('active-step');

        // Logic for Progress Bar (1-4)
        let progressIndex = stepNumber;
        if (stepNumber === 'error') progressIndex = 1;
        if (stepNumber === 5) progressIndex = 4; // Success keeps full bar

        document.querySelectorAll('.step').forEach((el, index) => {
            if (index + 1 <= progressIndex) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        // Scroll top
        const container = document.querySelector('.booking-container');
        if (container) container.scrollIntoView({ behavior: 'smooth' });
    }

    function renderRooms(rooms) {
        elements.roomList.innerHTML = '';
        if (rooms.length === 0) {
            elements.roomList.innerHTML = '<p class="text-center">No rooms available.</p>';
            return;
        }

        rooms.forEach(room => {
            let image = 'assets/images/room1.png';
            if (room.id.includes('heritage')) image = 'assets/images/room2.png';
            if (room.id.includes('courtyard')) image = 'assets/images/room3.png';

            const card = document.createElement('div');
            card.className = 'room-select-card';
            card.innerHTML = `
                <img src="${image}" class="room-thumb">
                <div class="room-info">
                    <h3>${room.name}</h3>
                    <p class="desc">${room.description || 'A beautiful room.'}</p>
                </div>
                <div class="room-action">
                    <span class="price">$${room.totalPrice}</span>
                    <button class="btn btn-outline" onclick="selectRoom('${room.id}')">Select</button>
                </div>
            `;
            elements.roomList.appendChild(card);
        });
    }

    function updateSummary() {
        if (elements.summaryCheckIn) elements.summaryCheckIn.textContent = state.checkIn;
        if (elements.summaryCheckOut) elements.summaryCheckOut.textContent = state.checkOut;
        if (elements.summaryRoom) elements.summaryRoom.textContent = state.selectedRoom ? state.selectedRoom.name : '-';
        if (elements.summaryTotal) elements.summaryTotal.textContent = state.selectedRoom ? `$${state.selectedRoom.totalPrice}` : '-';
    }

    function setLoading(isLoading) {
        if (!elements.loadingOverlay) return;
        elements.loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    }

    // Attach listeners
    if (elements.searchBtn) elements.searchBtn.onclick = searchAvailability;
    if (elements.confirmBtn) elements.confirmBtn.onclick = confirmBooking;

    // Init
    initPaymentVerification();

    // Expose globals
    window.goToStep = goToStep;
    window.selectRoom = selectRoom;
});
