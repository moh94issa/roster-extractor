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
    
    const daysDiff = Math.ceil((rangeEndDate - rangeStartDate) / (1000 * 60 * 60 * 24)) + 1;
    
    /* Storage for all data */
    let allShifts = {};
    let allDates = new Set();
    let weeksProcessed = 0;
    let currentViewDate = null;
    let processedWeeks = new Set(); // Track which weeks we've already processed
    
    /* Helper function to format date */
    const formatDate = (date) => {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    };
    
    /* Get Monday of a given week */
    const getMondayOfWeek = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    };
    
    /* Check if date is within user-specified range */
    const isDateInRange = (date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const start = new Date(rangeStartDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(rangeEndDate);
        end.setHours(23, 59, 59, 999);
        return d >= start && d <= end;
    };
    
    /* Get week identifier for deduplication */
    const getWeekId = (date) => {
        const monday = getMondayOfWeek(date);
        return formatDate(monday);
    };
    
    /* Function to wait for page to fully load with better checks */
    const waitForLoad = (expectedWeek = null) => {
        return new Promise((resolve) => {
            let attempts = 0;
            let lastDataCount = 0;
            let stableCount = 0;
            
            const checkInterval = setInterval(() => {
                attempts++;
                
                // Check all schedulers are loaded
                const schedulers = jQuery('.k-scheduler');
                if (schedulers.length === 0) {
                    if (attempts > 40) {
                        clearInterval(checkInterval);
                        console.warn('No schedulers found after timeout');
                        resolve();
                    }
                    return;
                }
                
                // Check if all schedulers have data
                let totalEvents = 0;
                let allSchedulersReady = true;
                
                schedulers.each(function() {
                    const scheduler = jQuery(this).data('kendoScheduler');
                    if (!scheduler || !scheduler.dataSource) {
                        allSchedulersReady = false;
                        return;
                    }
                    
                    const events = scheduler.dataSource.data();
                    totalEvents += events.length;
                    
                    // Check if resources are loaded
                    if (scheduler.resources && scheduler.resources[0]) {
                        const people = scheduler.resources[0].dataSource.data();
                        if (people.length === 0) {
                            allSchedulersReady = false;
                        }
                    } else {
                        allSchedulersReady = false;
                    }
                });
                
                // Check if DOM elements are present
                const eventElements = jQuery('.k-event').length;
                const teamHeaders = jQuery('.titleBar').length;
                
                // Check for stability (data not changing)
                if (totalEvents === lastDataCount && totalEvents > 0 && allSchedulersReady && eventElements > 0) {
                    stableCount++;
                } else {
                    stableCount = 0;
                    lastDataCount = totalEvents;
                }
                
                // Consider loaded when stable for 3 checks (1.5 seconds)
                if (stableCount >= 3 && teamHeaders > 0) {
                    clearInterval(checkInterval);
                    console.log(`Page loaded: ${totalEvents} events, ${eventElements} DOM elements, ${teamHeaders} teams`);
                    setTimeout(resolve, 500); // Small extra delay for safety
                } else if (attempts > 40) { // 20 seconds timeout
                    clearInterval(checkInterval);
                    console.warn('Load timeout - proceeding with partial data');
                    resolve();
                }
            }, 500);
        });
    };
    
    /* Function to navigate to a specific date */
    const navigateToDate = async (targetDate) => {
        const scheduler = jQuery('.k-scheduler').first().data('kendoScheduler');
        if (!scheduler) {
            console.error('No scheduler found for navigation');
            return false;
        }
        
        const beforeDate = scheduler.date();
        console.log(`Navigating from ${formatDate(beforeDate)} to ${formatDate(targetDate)}`);
        
        // Set the scheduler date
        scheduler.date(new Date(targetDate));
        
        // Trigger change event to ensure UI updates
        scheduler.trigger('navigate');
        
        // Wait for load
        await waitForLoad();
        
        // Verify navigation succeeded
        const afterDate = scheduler.date();
        if (Math.abs(afterDate - targetDate) > 7 * 24 * 60 * 60 * 1000) {
            console.warn('Navigation may have failed - large date difference');
            return false;
        }
        
        return true;
    };
    
    /* Function to extract data from current view */
    const extractWeekData = () => {
        const schedulers = jQuery('.k-scheduler');
        console.log(`Found ${schedulers.length} schedulers`);
        
        if (schedulers.length === 0) {
            console.warn('No schedulers found on page');
            return 0;
        }
        
        let eventsInRange = 0;
        let eventsOutOfRange = 0;
        let currentWeekMonday = null;
        
        schedulers.each(function(index) {
            const scheduler = jQuery(this).data('kendoScheduler');
            if (!scheduler) {
                console.warn(`Scheduler ${index + 1} has no data`);
                return;
            }
            
            // Get current week from scheduler
            if (!currentWeekMonday && scheduler.date) {
                currentWeekMonday = getMondayOfWeek(scheduler.date());
                console.log(`Processing week of ${formatDate(currentWeekMonday)}`);
            }
            
            /* Get the team name from the header */
            const teamHeader = jQuery(this).closest('.team-group').find('h2.titleBar').text().trim();
            if (!teamHeader) {
                console.warn(`No team header found for scheduler ${index + 1}`);
            }
            
            /* Get all events from the scheduler's data source */
            const allEvents = scheduler.dataSource.data();
            
            /* Get all resources (people) for this team */
            if (!scheduler.resources || !scheduler.resources[0]) {
                console.warn(`No resources found for team ${teamHeader}`);
                return;
            }
            
            const people = scheduler.resources[0].dataSource.data();
            console.log(`Team ${teamHeader}: ${people.length} people, ${allEvents.length} events`);
            
            /* Process each person in this team */
            people.forEach(person => {
                const staffKey = `${person.personName}|${teamHeader}`;
                
                /* Initialize person if not exists */
                if (!allShifts[staffKey]) {
                    allShifts[staffKey] = {
                        name: person.personName,
                        team: teamHeader,
                        shifts: {}
                    };
                }
                
                /* Find events for this specific person */
                const personEvents = allEvents.filter(event => event.personId === person.personId);
                
                /* Process each event */
                personEvents.forEach(event => {
                    const startDate = new Date(event.start);
                    // Use 'end' property instead of 'endDate'
                    const endDate = new Date(event.end);
                    
                    /* Get shift title */
                    const shiftTitle = (event.title || event.fullTitle || 'Shift').trim();
                    
                    /* Set to beginning of day */
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(0, 0, 0, 0);
                    
                    // Since end is typically at 00:00 of the next day, we need to subtract one day
                    // to get the actual last day of the shift
                    const actualEndDate = new Date(endDate);
                    actualEndDate.setDate(actualEndDate.getDate() - 1);
                    
                    /* Process each day of the shift */
                    let currentDate = new Date(startDate);
                    while (currentDate <= actualEndDate) {
                        if (isDateInRange(currentDate)) {
                            const dateStr = formatDate(currentDate);
                            allDates.add(dateStr);
                            allShifts[staffKey].shifts[dateStr] = shiftTitle;
                            eventsInRange++;
                        } else {
                            eventsOutOfRange++;
                        }
                        currentDate.setDate(currentDate.getDate() + 1);
                    }
                });
            });
        });
        
        console.log(`Extracted: ${eventsInRange} shifts in range, ${eventsOutOfRange} outside range`);
        return eventsInRange;
    };
    
    /* Function to generate and download CSV */
    const generateCSV = () => {
        /* Create array of all dates in range */
        const sortedDates = [];
        let currentDate = new Date(rangeStartDate);
        while (currentDate <= rangeEndDate) {
            sortedDates.push(formatDate(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        /* Build CSV */
        let csv = 'Name,Team,' + sortedDates.join(',') + '\n';
        
        /* Sort staff by team and name */
        const sortedStaff = Object.values(allShifts).sort((a, b) => {
            if (a.team !== b.team) return a.team.localeCompare(b.team);
            return a.name.localeCompare(b.name);
        });
        
        /* Add rows */
        sortedStaff.forEach(staff => {
            const row = [`"${staff.name}"`, `"${staff.team}"`];
            sortedDates.forEach(date => {
                row.push(`"${staff.shifts[date] || ''}"`);
            });
            csv += row.join(',') + '\n';
        });
        
        /* Download */
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
            
            /* Wait for initial page load */
            console.log('Waiting for initial page load...');
            await waitForLoad();
            
            const scheduler = jQuery('.k-scheduler').first().data('kendoScheduler');
            if (!scheduler) {
                throw new Error('No scheduler found on page');
            }
            
            /* Determine all weeks we need to visit */
            const weeksToProcess = new Set();
            let checkDate = new Date(rangeStartDate);
            
            while (checkDate <= rangeEndDate) {
                const weekMonday = getMondayOfWeek(checkDate);
                weeksToProcess.add(getWeekId(weekMonday));
                checkDate.setDate(checkDate.getDate() + 7);
            }
            
            console.log(`Need to process ${weeksToProcess.size} week(s)`);
            
            /* Start with the first week we need */
            const firstMonday = getMondayOfWeek(rangeStartDate);
            console.log(`Navigating to first week: ${formatDate(firstMonday)}`);
            
            const navigated = await navigateToDate(firstMonday);
            if (!navigated) {
                console.warn('Failed to navigate to start week, extracting current view');
            }
            
            /* Process all necessary weeks */
            for (let weekId of weeksToProcess) {
                if (processedWeeks.has(weekId)) {
                    console.log(`Week ${weekId} already processed, skipping`);
                    continue;
                }
                
                // Parse week ID back to date
                const [day, month, year] = weekId.split('-').map(Number);
                const weekMonday = new Date(year, month - 1, day);
                
                // Navigate to this week if not current
                const currentWeek = getMondayOfWeek(scheduler.date());
                if (Math.abs(currentWeek - weekMonday) > 1000) { // More than 1 second difference
                    console.log(`Navigating to week of ${weekId}`);
                    const navSuccess = await navigateToDate(weekMonday);
                    if (!navSuccess) {
                        console.warn(`Failed to navigate to week ${weekId}`);
                        continue;
                    }
                }
                
                // Extract data for this week
                console.log(`Extracting week ${weekId} (${processedWeeks.size + 1}/${weeksToProcess.size})`);
                const extracted = extractWeekData();
                
                if (extracted > 0) {
                    processedWeeks.add(weekId);
                    weeksProcessed++;
                } else {
                    console.warn(`No data extracted for week ${weekId}`);
                }
                
                // Small delay between weeks to avoid overwhelming the system
                if (processedWeeks.size < weeksToProcess.size) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            console.log('\n=== Extraction complete! ===');
            console.log(`Date range: ${startDateStr} to ${endDateStr}`);
            console.log(`Weeks processed: ${weeksProcessed}`);
            console.log(`Total staff: ${Object.keys(allShifts).length}`);
            console.log(`Total days: ${daysDiff}`);
            
            if (Object.keys(allShifts).length === 0) {
                alert('No data was extracted. Please check that the page is loaded correctly and try again.');
                return;
            }
            
            generateCSV();
            
            alert(`Roster extracted successfully!\n\nDate range: ${startDateStr} to ${endDateStr}\nStaff: ${Object.keys(allShifts).length}\nWeeks processed: ${weeksProcessed}`);
            
        } catch (error) {
            console.error('Error during extraction:', error);
            alert(`Error: ${error.message}\n\nCheck console for details.\n\nPartial data may have been extracted.`);
            
            // Offer to download partial data if any was collected
            if (Object.keys(allShifts).length > 0) {
                if (confirm('Some data was extracted. Do you want to download the partial results?')) {
                    generateCSV();
                }
            }
        }
    };
    
    /* Start extraction */
    console.log('=== ROSTER EXTRACTION STARTING ===');
    extractAllWeeks();
})();
