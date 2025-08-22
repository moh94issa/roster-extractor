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
    const shiftTypes = new Map(); // Store unique shift types
    const variantFrequency = new Map(); // Track frequency of each variant
    
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
    
    /* Extract time from Date object */
    const extractTime = (dateObj) => {
        if (!dateObj) return null;
        const d = new Date(dateObj);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        // Return null if it's a whole day event (00:00)
        if (hours === '00' && minutes === '00') return null;
        return `${hours}:${minutes}`;
    };
    
    /* Create unique key for shift variant */
    const createShiftKey = (shift) => {
        const start = shift.startTime || 'none';
        const end = shift.endTime || 'none';
        const full = shift.fullTitle || shift.title;
        return `${shift.title}|${full}|${start}|${end}`;
    };
    
    /* Check if shift crosses midnight */
    const crossesMidnight = (startTime, endTime) => {
        if (!startTime || !endTime) return false;
        const [startHour] = startTime.split(':').map(Number);
        const [endHour] = endTime.split(':').map(Number);
        return endHour < startHour;
    };
    
    /* Get current displayed week from the page */
    const getCurrentDisplayedWeek = () => {
        const dateInput = document.querySelector('.date-picker-short, input[type="text"][readonly]');
        if (!dateInput || !dateInput.value) return null;
        
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const parts = dateInput.value.split(' ');
        if (parts.length !== 3) return null;
        
        const day = parseInt(parts[0]);
        const month = monthNames.indexOf(parts[1]);
        const year = parseInt(parts[2]);
        
        if (isNaN(day) || month === -1 || isNaN(year)) return null;
        
        const displayedDate = new Date(year, month, day);
        return getMondayOfWeek(displayedDate);
    };
    
    /* Navigation using the date input */
    const navigateToDate = async (targetDate) => {
        const currentWeek = getCurrentDisplayedWeek();
        const targetWeek = getMondayOfWeek(targetDate);
        
        if (currentWeek && currentWeek.getTime() === targetWeek.getTime()) {
            console.log(`Already on week of ${formatDate(targetDate)}, skipping navigation`);
            return true;
        }
        
        console.log(`Navigating to week of ${formatDate(targetDate)}`);
        
        const dateInput = document.querySelector('.date-picker-short, input[type="text"][readonly]');
        if (!dateInput) {
            console.error('Date input not found');
            return false;
        }
        
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const d = new Date(targetDate);
        const dateStr = `${String(d.getDate()).padStart(2, '0')} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        
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
        
        if (typeof jQuery !== 'undefined' && jQuery('.k-scheduler').length > 0) {
            jQuery('.k-scheduler').each(function() {
                const scheduler = jQuery(this).data('kendoScheduler');
                if (!scheduler || !scheduler.dataSource) return;
                
                const teamElement = jQuery(this).closest('.team-group, [id^="teamRoster"]');
                const teamName = teamElement.find('h2, .titleBar').first().text().trim() || 'Unknown Team';
                
                if (!scheduler.resources || !scheduler.resources[0]) return;
                const people = scheduler.resources[0].dataSource.data();
                
                const events = scheduler.dataSource.data();
                console.log(`Team ${teamName}: ${people.length} people, ${events.length} events`);
                
                people.forEach(person => {
                    const staffKey = `${person.personName}|${teamName}`;
                    
                    if (!allShifts[staffKey]) {
                        allShifts[staffKey] = {
                            name: person.personName,
                            team: teamName,
                            shifts: {}
                        };
                    }
                    
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
                        
                        // Extract complete shift information
                        const shiftInfo = {
                            title: (event.title || 'Shift').trim(),
                            fullTitle: (event.fullTitle || event.title || 'Shift').trim(),
                            startTime: extractTime(event.start),
                            endTime: extractTime(event.end),
                            isNonEffective: event.isNonEffective === true,
                            eventId: event.id
                        };
                        
                        // Process each day of the shift
                        let currentDate = new Date(startDate);
                        currentDate.setHours(0, 0, 0, 0);
                        endDate.setHours(23, 59, 59, 999);
                        
                        while (currentDate <= endDate) {
                            if (currentDate >= rangeStartDate && currentDate <= rangeEndDate) {
                                const dateStr = formatDate(currentDate);
                                
                                if (!eventsByDate[dateStr]) {
                                    eventsByDate[dateStr] = [];
                                }
                                
                                eventsByDate[dateStr].push(shiftInfo);
                            }
                            currentDate.setDate(currentDate.getDate() + 1);
                        }
                    });
                    
                    // Process each date and decide which shift(s) to keep
                    Object.keys(eventsByDate).forEach(dateStr => {
                        const dayEvents = eventsByDate[dateStr];
                        
                        // Separate effective and non-effective shifts
                        const effectiveShifts = dayEvents.filter(e => !e.isNonEffective);
                        const selectedShifts = effectiveShifts.length > 0 ? effectiveShifts : dayEvents;
                        
                        // If multiple shifts for the day, concatenate them
                        if (selectedShifts.length === 1) {
                            const shift = selectedShifts[0];
                            if (!allShifts[staffKey].shifts[dateStr]) {
                                allShifts[staffKey].shifts[dateStr] = shift;
                                shiftsExtracted++;
                                
                                // Track this shift type
                                const key = createShiftKey(shift);
                                if (!shiftTypes.has(key)) {
                                    shiftTypes.set(key, {
                                        title: shift.title,
                                        fullTitle: shift.fullTitle,
                                        startTime: shift.startTime,
                                        endTime: shift.endTime
                                    });
                                }
                                variantFrequency.set(key, (variantFrequency.get(key) || 0) + 1);
                            }
                        } else if (selectedShifts.length > 1) {
                            // Multiple shifts on the same day - create a combined entry
                            const combinedTitle = selectedShifts.map(s => s.title).join(' / ');
                            const combinedFullTitle = selectedShifts.map(s => s.fullTitle).join(' / ');
                            
                            const combinedShift = {
                                title: combinedTitle,
                                fullTitle: combinedFullTitle,
                                startTime: selectedShifts[0].startTime,
                                endTime: selectedShifts[selectedShifts.length - 1].endTime,
                                isMultiple: true
                            };
                            
                            if (!allShifts[staffKey].shifts[dateStr]) {
                                allShifts[staffKey].shifts[dateStr] = combinedShift;
                                shiftsExtracted++;
                                
                                const key = createShiftKey(combinedShift);
                                if (!shiftTypes.has(key)) {
                                    shiftTypes.set(key, {
                                        title: combinedShift.title,
                                        fullTitle: combinedShift.fullTitle,
                                        startTime: combinedShift.startTime,
                                        endTime: combinedShift.endTime
                                    });
                                }
                                variantFrequency.set(key, (variantFrequency.get(key) || 0) + 1);
                            }
                        }
                    });
                });
            });
        }
        
        console.log(`Extracted ${shiftsExtracted} new shift assignments`);
        return shiftsExtracted;
    };
    
    /* Assign final titles to shift variants */
    const assignFinalTitles = () => {
        const finalTitleMap = new Map();
        const titleGroups = {};
        
        // Group shifts by their base title
        shiftTypes.forEach((shift, key) => {
            const baseTitle = shift.title;
            if (!titleGroups[baseTitle]) {
                titleGroups[baseTitle] = [];
            }
            titleGroups[baseTitle].push(key);
        });
        
        // Assign final titles to each group
        Object.entries(titleGroups).forEach(([baseTitle, keys]) => {
            if (keys.length === 1) {
                // Only one variant, keep original title
                finalTitleMap.set(keys[0], baseTitle);
            } else {
                // Multiple variants - sort by frequency, then by start time for ties
                keys.sort((a, b) => {
                    const freqA = variantFrequency.get(a) || 0;
                    const freqB = variantFrequency.get(b) || 0;
                    
                    if (freqA !== freqB) {
                        return freqB - freqA; // Higher frequency first
                    }
                    
                    // Frequency tie - use earliest start time
                    const shiftA = shiftTypes.get(a);
                    const shiftB = shiftTypes.get(b);
                    const startA = shiftA.startTime || '99:99';
                    const startB = shiftB.startTime || '99:99';
                    return startA.localeCompare(startB);
                });
                
                // Assign titles - most frequent keeps original
                keys.forEach((key, index) => {
                    const suffix = index === 0 ? '' : index;
                    finalTitleMap.set(key, baseTitle + suffix);
                });
            }
        });
        
        return finalTitleMap;
    };
    
    /* Generate CSV */
    const generateCSV = (finalTitleMap) => {
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
                const shiftData = staff.shifts[date];
                if (shiftData) {
                    const key = createShiftKey(shiftData);
                    const finalTitle = finalTitleMap.get(key) || shiftData.title;
                    row.push(`"${finalTitle}"`);
                } else {
                    row.push('""');
                }
            });
            csv += row.join(',') + '\n';
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileName = `roster_${startDateStr.replace(/\//g, '-')}_to_${endDateStr.replace(/\//g, '-')}`;
        a.download = `${fileName}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`CSV downloaded: ${sortedStaff.length} staff, ${sortedDates.length} days`);
        return fileName;
    };
    
    /* Generate JSON file with shift types */
    const generateShiftTypesJSON = (finalTitleMap, fileName) => {
        const shiftTypesArray = [];
        
        // Convert map to array and add additional info
        finalTitleMap.forEach((finalTitle, key) => {
            const shift = shiftTypes.get(key);
            const frequency = variantFrequency.get(key) || 0;
            
            shiftTypesArray.push({
                originalTitle: shift.title,
                fullTitle: shift.fullTitle,
                startTime: shift.startTime,
                endTime: shift.endTime,
                finalTitle: finalTitle,
                frequency: frequency,
                crossesMidnight: crossesMidnight(shift.startTime, shift.endTime)
            });
        });
        
        // Sort by final title
        shiftTypesArray.sort((a, b) => a.finalTitle.localeCompare(b.finalTitle));
        
        const jsonData = {
            extractionDate: new Date().toISOString().split('T')[0],
            dateRange: {
                start: formatDate(rangeStartDate),
                end: formatDate(rangeEndDate)
            },
            totalStaff: Object.keys(allShifts).length,
            totalShiftTypes: shiftTypesArray.length,
            shiftTypes: shiftTypesArray
        };
        
        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`JSON downloaded: ${shiftTypesArray.length} shift types`);
    };
    
    /* Main extraction process */
    const extractAllWeeks = async () => {
        try {
            console.log(`Extracting roster data from ${startDateStr} to ${endDateStr}...`);
            
            await waitForLoad();
            
            const weeksToProcess = [];
            const processedWeekIds = new Set();
            
            let checkDate = getMondayOfWeek(rangeStartDate);
            
            while (checkDate <= rangeEndDate) {
                const weekId = formatDate(checkDate);
                
                const weekEnd = new Date(checkDate);
                weekEnd.setDate(weekEnd.getDate() + 6);
                
                if (weekEnd >= rangeStartDate && checkDate <= rangeEndDate) {
                    if (!processedWeekIds.has(weekId)) {
                        weeksToProcess.push(new Date(checkDate));
                        processedWeekIds.add(weekId);
                    }
                }
                
                checkDate.setDate(checkDate.getDate() + 7);
            }
            
            console.log(`Need to process ${weeksToProcess.length} weeks`);
            
            // Process each week
            for (let i = 0; i < weeksToProcess.length; i++) {
                const weekMonday = weeksToProcess[i];
                
                console.log(`\nProcessing week ${i + 1}/${weeksToProcess.length}: ${formatDate(weekMonday)}`);
                
                await navigateToDate(weekMonday);
                
                const extracted = extractWeekData();
                
                if (extracted > 0) {
                    weeksProcessed++;
                }
                
                if (i < weeksToProcess.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            console.log('\n=== Extraction complete! ===');
            console.log(`Total staff: ${Object.keys(allShifts).length}`);
            console.log(`Weeks processed: ${weeksProcessed}`);
            console.log(`Unique shift types: ${shiftTypes.size}`);
            
            if (Object.keys(allShifts).length === 0) {
                alert('No data was extracted. Please check the page and try again.');
                return;
            }
            
            // Assign final titles to variants
            const finalTitleMap = assignFinalTitles();
            
            // Generate outputs
            const fileName = generateCSV(finalTitleMap);
            generateShiftTypesJSON(finalTitleMap, fileName);
            
            alert(`Roster extracted successfully!\n\nStaff: ${Object.keys(allShifts).length}\nWeeks: ${weeksProcessed}\nShift Types: ${shiftTypes.size}\n\nTwo files downloaded:\n- ${fileName}.csv\n- ${fileName}.json`);
            
        } catch (error) {
            console.error('Error:', error);
            alert(`Error: ${error.message}`);
            
            if (Object.keys(allShifts).length > 0) {
                if (confirm('Partial data extracted. Download it?')) {
                    const finalTitleMap = assignFinalTitles();
                    const fileName = generateCSV(finalTitleMap);
                    generateShiftTypesJSON(finalTitleMap, fileName);
                }
            }
        }
    };
    
    console.log('=== ROSTER EXTRACTION STARTING ===');
    extractAllWeeks();
})();
