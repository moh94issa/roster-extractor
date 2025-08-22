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
    let weeksProcessed = 0;
    
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
    
    /* Navigation using the date input */
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
        
        // Set the value
        const wasReadonly = dateInput.hasAttribute('readonly');
        if (wasReadonly) {
            dateInput.removeAttribute('readonly');
        }
        
        dateInput.value = dateStr;
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        dateInput.dispatchEvent(new Event('blur', { bubbles: true }));
        
        if (wasReadonly) {
            dateInput.setAttribute('readonly', 'readonly');
        }
        
        // Wait for reload
        await new Promise(resolve => setTimeout(resolve, 3000));
        await waitForLoad();
        
        return true;
    };
    
    /* Wait for page load */
    const waitForLoad = () => {
        return new Promise((resolve) => {
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                
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
    
    /* Extract data from current week view */
    const extractWeekData = () => {
        console.log('Extracting data for current week...');
        let shiftsExtracted = 0;
        
        // Use jQuery/Kendo if available
        if (typeof jQuery !== 'undefined' && jQuery('.k-scheduler').length > 0) {
            jQuery('.k-scheduler').each(function() {
                const scheduler = jQuery(this).data('kendoScheduler');
                if (!scheduler || !scheduler.dataSource) return;
                
                // Get team name
                const teamElement = jQuery(this).closest('.team-group, [id^="teamRoster"]');
                const teamName = teamElement.find('h2, .titleBar').first().text().trim() || 'Unknown Team';
                
                // Get resources (people)
                if (!scheduler.resources || !scheduler.resources[0]) return;
                const people = scheduler.resources[0].dataSource.data();
                
                // Get all events
                const events = scheduler.dataSource.data();
                console.log(`Team ${teamName}: ${people.length} people, ${events.length} events`);
                
                // Process each person
                people.forEach(person => {
                    const staffKey = `${person.personName}|${teamName}`;
                    
                    // Initialize if needed
                    if (!allShifts[staffKey]) {
                        allShifts[staffKey] = {
                            name: person.personName,
                            team: teamName,
                            shifts: {}
                        };
                    }
                    
                    // Find events for this person
                    const personEvents = events.filter(e => e.personId === person.personId);
                    
                    // Group events by date to handle multiple allocations
                    const eventsByDate = {};
                    
                    personEvents.forEach(event => {
                        const startDate = new Date(event.start);
                        const endDate = event.end ? new Date(event.end) : new Date(event.start);
                        
                        // Fix end date if it's at midnight (should be previous day)
                        if (endDate.getHours() === 0 && endDate > startDate) {
                            endDate.setDate(endDate.getDate() - 1);
                        }
                        
                        const shiftTitle = (event.title || event.fullTitle || 'Shift').trim();
                        const isNonEffective = event.isNonEffective === true;
                        
                        // Process each day of the shift
                        let currentDate = new Date(startDate);
                        currentDate.setHours(0, 0, 0, 0);
                        endDate.setHours(23, 59, 59, 999);
                        
                        while (currentDate <= endDate) {
                            // Check if date is in requested range
                            if (currentDate >= rangeStartDate && currentDate <= rangeEndDate) {
                                const dateStr = formatDate(currentDate);
                                
                                // Initialize array for this date if needed
                                if (!eventsByDate[dateStr]) {
                                    eventsByDate[dateStr] = [];
                                }
                                
                                // Add event info for this date
                                eventsByDate[dateStr].push({
                                    title: shiftTitle,
                                    isNonEffective: isNonEffective
                                });
                            }
                            currentDate.setDate(currentDate.getDate() + 1);
                        }
                    });
                    
                    // Now process each date and decide which shift(s) to keep
                    Object.keys(eventsByDate).forEach(dateStr => {
                        const dayEvents = eventsByDate[dateStr];
                        
                        // Check if there are any effective shifts for this day
                        const effectiveShifts = dayEvents.filter(e => !e.isNonEffective);
                        
                        let selectedShift = '';
                        
                        if (effectiveShifts.length > 0) {
                            // If there are effective shifts, use only those (prefer green)
                            // If multiple effective shifts, concatenate them
                            selectedShift = effectiveShifts.map(e => e.title).join(' / ');
                        } else {
                            // If only non-effective shifts, use them
                            selectedShift = dayEvents.map(e => e.title).join(' / ');
                        }
                        
                        // Only add if not already present (avoid duplicates from re-processing)
                        if (!allShifts[staffKey].shifts[dateStr] && selectedShift) {
                            allShifts[staffKey].shifts[dateStr] = selectedShift;
                            shiftsExtracted++;
                        }
                    });
                });
            });
        }
        
        console.log(`Extracted ${shiftsExtracted} new shift assignments`);
        return shiftsExtracted;
    };
    
    /* Generate CSV */
    const generateCSV = () => {
        // Create date range array
        const sortedDates = [];
        let currentDate = new Date(rangeStartDate);
        while (currentDate <= rangeEndDate) {
            sortedDates.push(formatDate(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // Build CSV header
        let csv = 'Name,Team,' + sortedDates.join(',') + '\n';
        
        // Sort staff by team and name
        const sortedStaff = Object.values(allShifts).sort((a, b) => {
            if (a.team !== b.team) return a.team.localeCompare(b.team);
            return a.name.localeCompare(b.name);
        });
        
        // Add data rows
        sortedStaff.forEach(staff => {
            const row = [`"${staff.name}"`, `"${staff.team}"`];
            sortedDates.forEach(date => {
                row.push(`"${staff.shifts[date] || ''}"`);
            });
            csv += row.join(',') + '\n';
        });
        
        // Download
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
            
            // Calculate all Mondays we need to visit
            const weeksToProcess = [];
            const processedWeekIds = new Set();
            
            // Start from the Monday of the week containing the start date
            let checkDate = getMondayOfWeek(rangeStartDate);
            
            // Continue until we've covered the week containing the end date
            // We need to include any week that contains ANY day in our range
            while (checkDate <= rangeEndDate) {
                const weekId = formatDate(checkDate);
                
                // Check if this week contains any days in our range
                const weekEnd = new Date(checkDate);
                weekEnd.setDate(weekEnd.getDate() + 6);
                
                // If this week overlaps with our date range at all, include it
                if (weekEnd >= rangeStartDate && checkDate <= rangeEndDate) {
                    if (!processedWeekIds.has(weekId)) {
                        weeksToProcess.push(new Date(checkDate));
                        processedWeekIds.add(weekId);
                    }
                }
                
                // Move to next week
                checkDate.setDate(checkDate.getDate() + 7);
            }
            
            console.log(`Need to process ${weeksToProcess.length} weeks`);
            
            // Process each week
            for (let i = 0; i < weeksToProcess.length; i++) {
                const weekMonday = weeksToProcess[i];
                
                console.log(`\nProcessing week ${i + 1}/${weeksToProcess.length}: ${formatDate(weekMonday)}`);
                
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
