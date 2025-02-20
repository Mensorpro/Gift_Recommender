// Global variables for infinite scrolling
let recommendationsOffset = 0;
let currentQuery = '';

// Initialize all interactive elements
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dark mode first
    const darkMode = localStorage.getItem('darkMode') === 'enabled';
    if (darkMode) {
        document.body.classList.add('dark-mode');
    }
    
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.textContent = darkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
        
        darkModeToggle.addEventListener('click', function() {
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');
            localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
            this.textContent = isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
        });
    }

    // Initialize other components
    initializeChips();
    initializeAgeSlider();
    initializeOccasionSelect();
    initializeBudgetSlider();
    initializeCurrencyToggle();
    initializeInterestTags();
    initializeMainPrompt();

    // Add infinite scroll listener
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        resultsSection.addEventListener('scroll', function(e) {
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            if (scrollTop + clientHeight >= scrollHeight - 20) { // When near bottom
                getRecommendations();
            }
        });
    }
});

// Chip select functionality
function initializeChips() {
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('selected');
            updatePrompt();
        });
    });
}

// Age slider functionality
function initializeAgeSlider() {
    const slider = document.getElementById('ageSlider');
    const value = document.getElementById('ageValue');
    
    slider.addEventListener('input', () => {
        value.textContent = `${slider.value} years`;
        updatePrompt();
    });
}

// Occasion select functionality
function initializeOccasionSelect() {
    const options = document.querySelectorAll('.occasion-option');
    options.forEach(option => {
        option.addEventListener('click', () => {
            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            updatePrompt();
        });
    });
}

// Budget slider functionality
function initializeBudgetSlider() {
    const minSlider = document.getElementById('budgetMin');
    const maxSlider = document.getElementById('budgetMax');
    const minValue = document.getElementById('minValue');
    const maxValue = document.getElementById('maxValue');
    const track = document.querySelector('.slider-track');

    function updateSliders() {
        const min = parseInt(minSlider.value);
        const max = parseInt(maxSlider.value);
        const currency = document.querySelector('.currency-toggle .active').textContent;

        if (min > max) {
            maxSlider.value = min;
        }

        minValue.textContent = `${currency}${min}`;
        maxValue.textContent = `${currency}${maxSlider.value}`;

        // Update track position
        const percent1 = (min / minSlider.max) * 100;
        const percent2 = (maxSlider.value / maxSlider.max) * 100;
        track.style.left = `${percent1}%`;
        track.style.width = `${percent2 - percent1}%`;

        updatePrompt();
    }

    minSlider.addEventListener('input', updateSliders);
    maxSlider.addEventListener('input', updateSliders);
    updateSliders();
}

// Currency toggle functionality
function initializeCurrencyToggle() {
    const currencies = document.querySelectorAll('.currency-toggle span');
    currencies.forEach(currency => {
        currency.addEventListener('click', () => {
            currencies.forEach(c => c.classList.remove('active'));
            currency.classList.add('active');
            updatePrompt();
        });
    });
}

// Interest tags functionality
function initializeInterestTags() {
    const tags = document.querySelectorAll('.tag');
    tags.forEach(tag => {
        tag.addEventListener('click', () => {
            tag.classList.toggle('selected');
            updatePrompt();
        });
    });
}

// Main prompt functionality
function initializeMainPrompt() {
    const generateBtn = document.getElementById('generateBtn');
    generateBtn.addEventListener('click', getRecommendations);
}

// Update prompt based on selected filters
function updatePrompt() {
    const mainPrompt = document.getElementById('mainPrompt');
    let promptParts = [];

    // Get relationship
    const selectedRelationship = document.querySelector('.chip.selected');
    if (selectedRelationship) {
        promptParts.push(`Looking for a gift for my ${selectedRelationship.textContent}`);
    }

    // Get age
    const age = document.getElementById('ageValue').textContent;
    if (age) {
        promptParts.push(`who is ${age} old`);
    }

    // Get occasion
    const selectedOccasion = document.querySelector('.occasion-option.selected');
    if (selectedOccasion) {
        promptParts.push(`for their ${selectedOccasion.querySelector('span:last-child').textContent}`);
    }

    // Get budget
    const currency = document.querySelector('.currency-toggle .active').textContent;
    const minBudget = document.getElementById('minValue').textContent;
    const maxBudget = document.getElementById('maxValue').textContent;
    promptParts.push(`with a budget between ${minBudget} and ${maxBudget}`);

    // Get interests
    const selectedInterests = Array.from(document.querySelectorAll('.tag.selected'))
        .map(tag => tag.textContent);
    if (selectedInterests.length > 0) {
        promptParts.push(`who is interested in ${selectedInterests.join(', ')}`);
    }

    mainPrompt.value = promptParts.join(' ');
}

// Get AI recommendations
async function getRecommendations() {
    const prompt = document.getElementById('mainPrompt').value;
    if (!prompt.trim()) {
        showError('Please provide some details about who you\'re shopping for.');
        return;
    }

    // Reset offset if it's a new query
    if (prompt !== currentQuery) {
        recommendationsOffset = 0;
        currentQuery = prompt;
        document.getElementById('recommendationsList').innerHTML = '';
    }

    showLoading();

    try {
        const response = await fetch('http://localhost:3000/api/recommend', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: prompt,
                count: 6,
                offset: recommendationsOffset
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.details || data.error || 'Failed to get recommendations');
        }

        displayRecommendations(data.recommendations, recommendationsOffset > 0);
        recommendationsOffset += 6; // Increment offset for next load
    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
}

// Display recommendations in the results section
function displayRecommendations(recommendationsText, append = false) {
    const recommendationsList = document.getElementById('recommendationsList');
    if (!recommendationsList) {
        console.error('Recommendations list not found');
        return;
    }

    const recommendations = recommendationsText.split('\n\n')
        .filter(block => block.trim() && /^\d/.test(block));

    // Create container if it doesn't exist
    let container = recommendationsList.querySelector('.recommendations-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'recommendations-container';
        recommendationsList.appendChild(container);
    }

    // Clear container if not appending
    if (!append) {
        container.innerHTML = '';
    }
    
    recommendations.forEach(rec => {
        const lines = rec.split('\n').map(l => l.trim());
        const number = lines[0];
        const name = lines[1];
        const price = lines.find(l => l.startsWith('Price:'))?.replace('Price:', '').trim() || '';
        const image = lines.find(l => l.startsWith('Image:'))?.replace('Image:', '').trim() || '';
        const why = lines.find(l => l.startsWith('Why:'))?.replace('Why:', '').trim() || '';

        const div = document.createElement('div');
        div.className = 'recommendation';
        div.innerHTML = `
            <div class="recommendation-content">
                <div class="recommendation-image">
                    <img src="${image}"
                         alt="${name}"
                         loading="lazy"
                         onerror="this.src='https://via.placeholder.com/400x300?text=Gift+Image'">
                </div>
                <div class="recommendation-info">
                    <div class="recommendation-number">${number}</div>
                    <h3 class="recommendation-title">${name}</h3>
                    <div class="recommendation-price">${price}</div>
                    <div class="recommendation-why">${why}</div>
                </div>
            </div>`;
        container.appendChild(div);
    });
    
    document.getElementById('resultsSection').style.display = 'block';
}

// Show loading state
function showLoading() {
    const resultSection = document.getElementById('resultsSection');
    const recommendationsList = document.getElementById('recommendationsList');
    if (!recommendationsList) return;

    // Remove existing loading if present
    hideLoading();
    
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <div class="loading-text">Finding perfect gift ideas...</div>
        </div>`;
    recommendationsList.appendChild(loading);
}

// Hide loading state
function hideLoading() {
    const loading = document.querySelector('.loading');
    if (loading) {
        loading.remove();
    }
}

// Show error message
function showError(message) {
    const recommendationsList = document.getElementById('recommendationsList');
    recommendationsList.innerHTML = `
        <div class="error">
            <h3 class="error-title">Error</h3>
            <p class="error-message">${message}</p>
        </div>`;
    document.getElementById('resultsSection').style.display = 'block';
}