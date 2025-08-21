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
    
    const isDateInRange = (date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const start = new Date(rangeStartDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(rangeEndDate);
        end.setHours(23, 59, 59, 999);
        return d >= start && d <= end;
    };
    
    const getWeekId = (date) => {
        const monday = getMondayOfWeek(date);
        return formatDate(monday);
    };
    
    /* Enhanced navigation function that uses the page's native navigation */
    const navigateToDate = async (targetDate) => {
        console.log(`Navigating to week of ${formatDate(targetDate)}`);
        
        // Try to use the date picker if available
        const datePicker = jQuery('.date-picker-short, .k-datepicker input').first();
        if (datePicker.length > 0) {
            // Check if there's a Kendo DatePicker widget
            const kendoDatePicker = datePicker.data('kendoDatePicker');
            if (kendoDatePicker) {
                kendoDatePicker.value(targetDate);
                kendoDatePicker.trigger('change');
            } else {
                // Try clicking on the date picker and setting value
                datePicker.click();
                datePicker.val(formatDateForInput(targetDate));
                datePicker.trigger('change');
            }
        }
        
        // Alternative: use navigation arrows if date picker doesn't work
        const scheduler = jQuery('.k-scheduler').first().data('kendoScheduler');
        if (scheduler) {
            const currentWeek = getMondayOfWeek(scheduler.date());
            const targetWeek = getMondayOfWeek(targetDate);
            const weeksDiff = Math.round((targetWeek - currentWeek) / (7 * 24 * 60 * 60 * 1000));
            
            if (weeksDiff !== 0) {
                // Use the toolbar navigation if available
                const navButton = weeksDiff > 0 ? 
                    jQuery('.k-scheduler-toolbar .k-nav-next, .k-i-arrow-e').first() : 
                    jQuery('.k-scheduler-toolbar .k-nav-prev, .k-i-arrow-w').first();
                
                if (navButton.length > 0) {
                    const steps = Math.abs(weeksDiff);
                    for (let i = 0; i < steps; i++) {
                        navButton.click();
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } else {
                    // Fallback: update all schedulers directly
                    jQuery('.k-scheduler').each(function() {
                        const sched = jQuery(this).data('kendoScheduler');
                        if (sched) {
                            sched.date(targetDate);
                        }
                    });
                }
            }
        }
        
        // Wait for the page to fully reload
        await waitForLoad();
        
        // Force refresh all schedulers
        jQuery('.k-scheduler').each(function() {
            const sched = jQuery(this).data('kendoScheduler');
            if (sched && sched.dataSource) {
                sched.dataSource.read();
                sched.refresh();
            }
        });
        
        // Additional wait for data to load
        await new Promise(resolve => setTimeout(resolve, 2000));
    };
    
    /* Enhanced wait function */
    const waitForLoad = () => {
        return new Promise((resolve) => {
            let attempts = 0;
            let lastDataCount = 0;
            let stableCount = 0;
            
            const checkInterval = setInterval(() => {
                attempts++;
                
                const schedulers = jQuery('.k-scheduler');
                if (schedulers.length === 0) {
                    if (attempts > 40) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                    return;
                }
                
                let totalEvents = 0;
                let allReady = true;
                
                schedulers.each(function() {
                    const scheduler = jQuery(this).data('kendoScheduler');
                    if (!scheduler || !scheduler.dataSource) {
                        allReady = false;
                        return;
                    }
                    
                    const events = scheduler.dataSource.data();
                    totalEvents += events.length;
                    
                    // Check if view is ready
                    if (!scheduler.view() || scheduler.view().element.find('.k-event').length === 0 && events.length > 0) {
                        allReady = false;
                    }
                });
                
                // Check DOM elements
                const hasEvents = jQuery('.k-event').length > 0;
                const hasTeams = jQuery('.titleBar').length > 0;
                
                if (totalEvents === lastDataCount && totalEvents > 0 && allReady && hasEvents && hasTeams) {
                    stableCount++;
                } else {
                    stableCount = 0;
                    lastDataCount = totalEvents;
                }
                
                if (stableCount >= 3) {
                    clearInterval(checkInterval);
                    console.log(`Page loaded: ${totalEvents} events`);
                    setTimeout(resolve, 500);
                } else if (attempts > 60) { // 30 seconds timeout
                    clearInterval(checkInterval);
                    console.warn('Load timeout');
                    resolve();
                }
            }, 500);
        });
    };
    
    /* Extract data from current view */
    const extractWeekData = () => {
        const schedulers = jQuery('.k-scheduler');
        console.log(`Found ${schedulers.length} schedulers`);
        
        if (schedulers.length === 0) {
            return 0;
        }
        
        let eventsInRange = 0;
        
        schedulers.each(function(index) {
            const scheduler = jQuery(this).data('kendoScheduler');
            if (!scheduler || !scheduler.dataSource) {
                console.warn(`Scheduler ${index + 1} has no data`);
                return;
            }
            
            const teamHeader = jQuery(this).closest('.team-group').find('h2.titleBar').text().trim() || 
                              jQuery(this).closest('[id^="teamRoster"]').find('h2').text().trim() ||
                              `Team ${index + 1}`;
            
            const allEvents = scheduler.dataSource.data();
            
            if (!scheduler.resources || !scheduler.resources[0]) {
                return;
            }
            
            const people = scheduler.resources[0].dataSource.data();
            console.log(`Team ${teamHeader}: ${people.length} people, ${allEvents.length} events`);
            
            people.forEach(person => {
                const staffKey = `${person.personName}|${teamHeader}`;
                
                if (!allShifts[staffKey]) {
                    allShifts[staffKey] = {
                        name: person.personName,
                        team: teamHeader,
                        shifts: {}
                    };
                }
                
                const personEvents = allEvents.filter(event => event.personId === person.personId);
                
                personEvents.forEach(event => {
                    const startDate = new Date(event.start);
                    const endDate = new Date(event.end || event.endDate);
                    
                    const shiftTitle = (event.title || event.fullTitle || 'Shift').trim();
                    
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(0, 0, 0, 0);
                    
                    const actualEndDate = new Date(endDate);
                    actualEndDate.setDate(actualEndDate.getDate() - 1);
                    
                    let currentDate = new Date(startDate);
                    while (currentDate <= actualEndDate) {
                        if (isDateInRange(currentDate)) {
                            const dateStr = formatDate(currentDate);
                            allDates.add(dateStr);
                            allShifts[staffKey].shifts[dateStr] = shiftTitle;
                            eventsInRange++;
                        }
                        currentDate.setDate(currentDate.getDate() + 1);
                    }
                });
            });
        });
        
        console.log(`Extracted: ${eventsInRange} shifts in range`);
        return eventsInRange;
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
            
            const weeksToProcess = new Set();
            let checkDate = new Date(rangeStartDate);
            
            while (checkDate <= rangeEndDate) {
                const weekMonday = getMondayOfWeek(checkDate);
                weeksToProcess.add(getWeekId(weekMonday));
                checkDate.setDate(checkDate.getDate() + 7);
            }
            
            console.log(`Need to process ${weeksToProcess.size} week(s)`);
            
            for (let weekId of weeksToProcess) {
                if (processedWeeks.has(weekId)) {
                    continue;
                }
                
                const [day, month, year] = weekId.split('-').map(Number);
                const weekMonday = new Date(year, month - 1, day);
                
                await navigateToDate(weekMonday);
                
                console.log(`Extracting week ${weekId} (${processedWeeks.size + 1}/${weeksToProcess.size})`);
                const extracted = extractWeekData();
                
                if (extracted > 0) {
                    processedWeeks.add(weekId);
                    weeksProcessed++;
                }
                
                if (processedWeeks.size < weeksToProcess.size) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
            
            console.log('\n=== Extraction complete! ===');
            console.log(`Total staff: ${Object.keys(allShifts).length}`);
            
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
