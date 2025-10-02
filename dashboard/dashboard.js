// User Dashboard Functionality
document.addEventListener('DOMContentLoaded', () => {
    // Chart.js integration for stats visualization
    if (typeof Chart !== 'undefined') {
        const ctx = document.getElementById('usageChart');
        if (ctx) {
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: 'Commands Executed',
                        data: [320, 450, 620, 780, 920, 1100],
                        borderColor: '#6366f1',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'top',
                        }
                    }
                }
            });
        }
    }

    // Real-time updates for command status
    const setupCommandUpdates = () => {
        // This would connect to your WebSocket or polling endpoint
        // For demo purposes, we'll simulate updates
        setInterval(() => {
            const statuses = ['Success', 'Failed'];
            const commands = [
                'autopilot deploy',
                'autopilot test',
                'autopilot analyze',
                'autopilot optimize'
            ];
            
            const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
            const randomCommand = commands[Math.floor(Math.random() * commands.length)];
            
            addCommandToRecent(randomCommand, randomStatus);
        }, 10000);
    };

    const addCommandToRecent = (command, status) => {
        const commandList = document.querySelector('.command-list');
        if (commandList) {
            const newItem = document.createElement('div');
            newItem.className = 'command-item';
            newItem.innerHTML = `
                <div class="command-meta">
                    <span class="status-badge status-${status.toLowerCase()}">${status}</span>
                    <span>${command}</span>
                </div>
                <div>Just now</div>
            `;
            commandList.prepend(newItem);
            
            // Limit to 10 items
            if (commandList.children.length > 10) {
                commandList.removeChild(commandList.lastChild);
            }
        }
    };

    setupCommandUpdates();
});

// Admin Panel Functionality
document.addEventListener('DOMContentLoaded', () => {
    // User search functionality
    const userSearch = document.getElementById('userSearch');
    if (userSearch) {
        userSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('tbody tr');
            
            rows.forEach(row => {
                const email = row.cells[0].textContent.toLowerCase();
                if (email.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    // Bulk actions for admin
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
        });
    }
});