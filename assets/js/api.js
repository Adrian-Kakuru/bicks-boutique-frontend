/**
 * API Module for Bick's Boutique Hotel
 * Handles all communication with the backend.
 */

const API_BASE_URL = 'http://localhost:5000/api/v1';

class ApiService {
    /**
     * Check room availability for a given date range and guest count.
     * @param {string} checkIn - YYYY-MM-DD
     * @param {string} checkOut - YYYY-MM-DD
     * @param {number} guests - Number of guests
     * @returns {Promise<Array>} - List of available rooms
     */
    static async checkAvailability(checkIn, checkOut, guests) {
        try {
            const url = new URL(`${API_BASE_URL}/availability`);
            url.searchParams.append('checkIn', checkIn);
            url.searchParams.append('checkOut', checkOut);
            url.searchParams.append('guests', guests);

            const response = await fetch(url);

            if (!response.ok) {
                // safely try to parse JSON error, fallback to status text
                let errorMsg = `Server Error (${response.status})`;
                try {
                    const errorData = await response.json();
                    if (errorData.message) errorMsg = errorData.message;
                } catch (e) {
                    // response was not JSON (e.g. 500 HTML page)
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            return data.availableRooms;
        } catch (error) {
            console.error('API Error (checkAvailability):', error);
            // Re-throw with user-friendly message if it's a network error
            if (error.message.includes('Failed to fetch')) {
                throw new Error('Network error. Please check your connection.');
            }
            throw error;
        }
    }

    /**
     * Initiate a booking for a specific room.
     * @param {Object} bookingDetails 
     * @returns {Promise<Object>} - Booking confirmation details including payment link
     */
    static async initiateBooking(bookingDetails) {
        try {
            const response = await fetch(`${API_BASE_URL}/bookings/initiate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bookingDetails)
            });

            if (!response.ok) {
                // safely try to parse JSON error, fallback to status text
                let errorMsg = `Server Error (${response.status})`;
                try {
                    const errorData = await response.json();
                    if (errorData.message) errorMsg = errorData.message;
                } catch (e) {
                    // response was not JSON
                }
                throw new Error(errorMsg);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error (initiateBooking):', error);
            if (error.message.includes('Failed to fetch')) {
                throw new Error('Network error. Unable to confirm booking.');
            }
            throw error;
        }
    }

    /**
     * Get the status of a specific booking.
     * @param {string|number} bookingId 
     * @returns {Promise<Object>} - Status object { status: 'CONFIRMED'|'AWAITING_PAYMENT'|... }
     */
    static async getBookingStatus(bookingId) {
        try {
            const response = await fetch(`${API_BASE_URL}/bookings/${bookingId}/status`);

            if (!response.ok) {
                let errorMsg = `Server Error (${response.status})`;
                try {
                    const errorData = await response.json();
                    if (errorData.message) errorMsg = errorData.message;
                } catch (e) { }
                throw new Error(errorMsg);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error (getBookingStatus):', error);
            throw error;
        }
    }
}

// Export for usage (if using modules) or attach to window
window.ApiService = ApiService;
