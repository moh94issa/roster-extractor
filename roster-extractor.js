(function(){
    /* Get date range from user */
    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(today.getDate() - today.getDay() + 1); // Monday of current week
    const defaultEnd = new Date(defaultStart);
    defaultEnd.setDate(defaultStart.getDate() + 27); // 4 weeks later
    
    const formatDateForInput = (date) => {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };
    
    const startDateStr = prompt(
        'Enter START date (DD/MM/YYYY):\n\nNote: This will extract shifts for your specified date range only.\nThe system will navigate through all necessary weeks.', 
        formatDateForInput(defaultStart)
    );
    
    if (!startDateStr) {
        alert('Extraction cancelled');
        return;
    }
    
    const endDateStr = prompt(
        'Enter END date (DD/MM/YYYY):\n\nNote: Long-term allocations (like Maternity leave) will be included only for dates in your range.', 
        formatDateForInput(defaultEnd)
    );
    
    if (!endDateStr) {
        alert('Extraction cancelled');
        return;
    }
    
    /* Parse dates */
    const parseInputDate = (dateStr) => {
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day);
    };
    
    const rangeStartDate = parseInputDate(startDateStr);
    const rangeEndDate = parseInputDate(endDateStr);
    
    if (isNaN(rangeStartDate) || isNaN(rangeEndDate)) {
        alert('Invalid date format. Please use DD/MM/YYYY');
        return;
    }
    
    if (rangeStartDate > rangeEndDate) {
        alert('Start date must be before end date');
        return;
    }
    
    /* Storage for all data */
    let allShifts = {};
    let allDates = new Set();
    let weeksProcessed = 0;
    let processedWeeks = new Set();
    
    /* Helper functions */
    const formatDate = (date) => {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    };
    
    const getMondayOfWeek = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    };
    
    const getWeekId = (date) => {
        const monday = getMondayOfWeek(date);
        return formatDate(monday);
    };
    
    /* Store initial page state to restore after each navigation */
    let initialUrl = window.location.href;
    
    /* Simple navigation using the date input field */
    const navigateToDate = async (targetDate) => {
        console.log(`Navigating to week of ${formatDate(targetDate)}`);
        
        // Find the date input field
        const dateInput = document.querySelector('.date-picker-short, input[type="text"][readonly]');
        if (!dateInput) {
            console.error('Date input not found');
            return false;
        }
        
        // Format date as the system expects (DD MMM YYYY)
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const d = new Date(targetDate);
        const dateStr = `${String(d.getDate()).padStart(2, '0')} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        
        // Remove readonly temporarily if present
        const wasReadonly = dateInput.hasAttribute('readonly');
        if (wasReadonly) {
            dateInput.removeAttribute('readonly');
        }
        
        // Set the value and trigger change
        dateInput.value = dateStr;
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        dateInput.dispatchEvent(new Event('blur', { bubbles: true }));
        
        // Restore readonly
        if (wasReadonly) {
            dateInput.setAttribute('readonly', 'readonly');
        }
        
        // Wait for page to reload
        await new Promise(resolve => setTimeout(resolve, 3000));
        await waitForLoad();
        
        return true;
    };
    
    /* Wait for page to load */
    const waitForLoad = () => {
        return new Promise((resolve) => {
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                
                // Check if any schedulers exist
                const schedulers = document.querySelectorAll('.k-scheduler, .team-roster-scheduler');
                const events = document.querySelectorAll('.k-event');
                
                if (schedulers.length > 0 && events.length > 0) {
                    clearInterval(checkInterval);
                    console.log(`Page loaded: ${schedulers.length} schedulers, ${events.length} events`);
                    setTimeout(resolve, 1000);
                } else if (attempts > 30) {
                    clearInterval(checkInterval);
                    console.warn('Load timeout');
                    resolve();
                }
            }, 500);
        });
    };
    
    /* Extract data from current view - simplified version */
    const extractWeekData = () => {
        console.log('Starting extraction for current week...');
        
        let eventsExtracted = 0;
        
        // Get all team groups
        const teamGroups = document.querySelectorAll('.team-group, [id^="teamRoster"]');
        console.log(`Found ${teamGroups.length} team groups`);
        
        teamGroups.forEach((teamGroup, index) => {
            // Get team name
            const teamHeader = teamGroup.querySelector('h2, .titleBar');
            const teamName = teamHeader ? teamHeader.textContent.trim() : `Team ${index + 1}`;
            
            // Get all staff rows in this team
            const staffRows = teamGroup.querySelectorAll('.k-scheduler-table tr');
            
            staffRows.forEach(row => {
                // Get staff name from the row header
                const nameCell = row.querySelector('th .info-cell, th div');
                if (!nameCell || !nameCell.textContent) return;
                
                const staffName = nameCell.textContent.trim();
                if (!staffName || staffName.includes('Sep') || staffName.includes('Date')) return; // Skip date headers
                
                const staffKey = `${staffName}|${teamName}`;
                
                // Initialize staff if not exists
                if (!allShifts[staffKey]) {
                    allShifts[staffKey] = {
                        name: staffName,
                        team: teamName,
                        shifts: {}
                    };
                }
            });
            
            // Now get all events in this team section
            const events = teamGroup.querySelectorAll('.k-event');
            console.log(`Team ${teamName}: ${events.length} events found`);
            
            events.forEach(event => {
                // Get the event details
                const titleElement = event.querySelector('.bubble-title, span');
                if (!titleElement) return;
                
                const shiftTitle = titleElement.textContent.trim();
                
                // Try to determine which date this event belongs to
                // This is tricky as we need to figure out the position
                // For now, let's extract what we can see
                
                // Get the current week dates from the date headers
                const dateHeaders = teamGroup.querySelectorAll('.k-slot-cell div');
                dateHeaders.forEach((header, dayIndex) => {
                    const headerText = header.textContent.trim();
                    if (headerText.match(/\d{2}\s\w{3}/)) { // Format: "01 Sep"
                        // Parse this date
                        const [day, month] = headerText.split(' ');
                        const monthMap = {
                            'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                            'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
                        };
                        
                        // Determine year (current year or next year if month is less than current)
                        const currentDate = new Date();
                        let year = currentDate.getFullYear();
                        if (monthMap[month] < currentDate.getMonth() - 6) {
                            year++;
                        }
                        
                        const eventDate = new Date(year, monthMap[month], parseInt(day));
                        const dateStr = formatDate(eventDate);
                        
                        // For now, assign this shift to all visible staff in this team
                        // This is a simplification - in reality we'd need to match positions
                        Object.keys(allShifts).forEach(key => {
                            if (key.endsWith(`|${teamName}`)) {
                                // Check if this date is in our range
                                if (eventDate >= rangeStartDate && eventDate <= rangeEndDate) {
                                    if (!allShifts[key].shifts[dateStr]) {
                                        allShifts[key].shifts[dateStr] = shiftTitle;
                                        eventsExtracted++;
                                    }
                                }
                            }
                        });
                    }
                });
            });
        });
        
        // Alternative extraction method using Kendo data if available
        try {
            if (typeof jQuery !== 'undefined' && jQuery('.k-scheduler').length > 0) {
                jQuery('.k-scheduler').each(function() {
                    const scheduler = jQuery(this).data('kendoScheduler');
                    if (!scheduler || !scheduler.dataSource) return;
                    
                    const teamElement = jQuery(this).closest('.team-group, [id^="teamRoster"]');
                    const teamName = teamElement.find('h2, .titleBar').first().text().trim() || 'Unknown Team';
                    
                    const events = scheduler.dataSource.data();
                    const resources = scheduler.resources && scheduler.resources[0] ? 
                                     scheduler.resources[0].dataSource.data() : [];
                    
                    console.log(`Kendo data - Team ${teamName}: ${resources.length} people, ${events.length} events`);
                    
                    resources.forEach(person => {
                        const staffKey = `${person.personName}|${teamName}`;
                        
                        if (!allShifts[staffKey]) {
                            allShifts[staffKey] = {
                                name: person.personName,
                                team: teamName,
                                shifts: {}
                            };
                        }
                        
                        const personEvents = events.filter(e => e.personId === person.personId);
                        
                        personEvents.forEach(event => {
                            const startDate = new Date(event.start);
                            const endDate = event.end ? new Date(event.end) : new Date(event.start);
                            
                            // Adjust end date (usually it's at 00:00 of next day)
                            if (endDate.getHours() === 0 && endDate > startDate) {
                                endDate.setDate(endDate.getDate() - 1);
                            }
                            
                            const shiftTitle = (event.title || event.fullTitle || 'Shift').trim();
                            
                            // Add shifts for each day in range
                            let currentDate = new Date(startDate);
                            currentDate.setHours(0, 0, 0, 0);
                            endDate.setHours(23, 59, 59, 999);
                            
                            while (currentDate <= endDate) {
                                if (currentDate >= rangeStartDate && currentDate <= rangeEndDate) {
                                    const dateStr = formatDate(currentDate);
                                    allShifts[staffKey].shifts[dateStr] = shiftTitle;
                                    eventsExtracted++;
                                }
                                currentDate.setDate(currentDate.getDate() + 1);
                            }
                        });
                    });
                });
            }
        } catch (e) {
            console.warn('Kendo extraction failed:', e);
        }
        
        console.log(`Extracted ${eventsExtracted} shift assignments`);
        return eventsExtracted;
    };
    
    /* Generate CSV */
    const generateCSV = () => {
        const sortedDates = [];
        let currentDate = new Date(rangeStartDate);
        while (currentDate <= rangeEndDate) {
            sortedDates.push(formatDate(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        let csv = 'Name,Team,' + sortedDates.join(',') + '\n';
        
        const sortedStaff = Object.values(allShifts).sort((a, b) => {
            if (a.team !== b.team) return a.team.localeCompare(b.team);
            return a.name.localeCompare(b.name);
        });
        
        sortedStaff.forEach(staff => {
            const row = [`"${staff.name}"`, `"${staff.team}"`];
            sortedDates.forEach(date => {
                row.push(`"${staff.shifts[date] || ''}"`);
            });
            csv += row.join(',') + '\n';
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `roster_${startDateStr.replace(/\//g, '-')}_to_${endDateStr.replace(/\//g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`CSV downloaded: ${sortedStaff.length} staff, ${sortedDates.length} days`);
    };
    
    /* Main extraction process */
    const extractAllWeeks = async () => {
        try {
            console.log(`Extracting roster data from ${startDateStr} to ${endDateStr}...`);
            
            await waitForLoad();
            
            // Extract initial week first
            console.log('Extracting initial week...');
            extractWeekData();
            
            // Determine all weeks to process
            const weeksToProcess = [];
            let checkDate = new Date(rangeStartDate);
            
            while (checkDate <= rangeEndDate) {
                const weekMonday = getMondayOfWeek(checkDate);
                const weekId = getWeekId(weekMonday);
                
                if (!processedWeeks.has(weekId)) {
                    weeksToProcess.push(weekMonday);
                    processedWeeks.add(weekId);
                }
                
                checkDate.setDate(checkDate.getDate() + 7);
            }
            
            console.log(`Need to process ${weeksToProcess.length} weeks total`);
            
            // Process each week
            for (let i = 0; i < weeksToProcess.length; i++) {
                const weekMonday = weeksToProcess[i];
                const weekId = getWeekId(weekMonday);
                
                console.log(`Processing week ${i + 1}/${weeksToProcess.length}: ${weekId}`);
                
                // Navigate to this week
                await navigateToDate(weekMonday);
                
                // Extract data
                const extracted = extractWeekData();
                
                if (extracted > 0) {
                    weeksProcessed++;
                }
                
                // Small delay between weeks
                if (i < weeksToProcess.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            console.log('\n=== Extraction complete! ===');
            console.log(`Total staff: ${Object.keys(allShifts).length}`);
            console.log(`Weeks processed: ${weeksProcessed}`);
            
            if (Object.keys(allShifts).length === 0) {
                alert('No data was extracted. Please check the page and try again.');
                return;
            }
            
            generateCSV();
            alert(`Roster extracted successfully!\n\nStaff: ${Object.keys(allShifts).length}\nWeeks: ${weeksProcessed}`);
            
        } catch (error) {
            console.error('Error:', error);
            alert(`Error: ${error.message}`);
            
            if (Object.keys(allShifts).length > 0) {
                if (confirm('Partial data extracted. Download it?')) {
                    generateCSV();
                }
            }
        }
    };
    
    console.log('=== ROSTER EXTRACTION STARTING ===');
    extractAllWeeks();
})();
