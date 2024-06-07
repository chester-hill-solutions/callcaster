export const getNextContact = (queue, householdMap, nextRecipient, groupByHousehold, skipHousehold) => {
    if (queue && householdMap && nextRecipient) {
        let currIndex;

        if (groupByHousehold && skipHousehold) {
            currIndex = Object.keys(householdMap).findIndex((curr) => curr === nextRecipient.contact.address);
            for (let i = currIndex + 1; i < Object.keys(householdMap).length; i++) {
                let household = householdMap[Object.keys(householdMap)[i]];
                for (let j = 0; j < household.length; j++) {
                    if (household[j].contact.phone) return household[j];
                }
            }
            for (let i = 0; i <= currIndex; i++) {
                let household = householdMap[Object.keys(householdMap)[i]];
                for (let j = 0; j < household.length; j++) {
                    if (household[j].contact.phone) return household[j];
                }
            }
        } else if (groupByHousehold) {
            const allHouseholds = Object.values(householdMap).flatMap(household => household);
            currIndex = allHouseholds.findIndex((curr) => curr.id === nextRecipient.id);
            
            for (let i = currIndex + 1; i < allHouseholds.length; i++) {
                
                if (allHouseholds[i].contact.phone) return allHouseholds[i];
            }
            for (let i = 0; i <= currIndex; i++) {
                if (allHouseholds[i].contact.phone) return allHouseholds[i];
            }
        } else {
            currIndex = queue.findIndex((curr) => curr.id === nextRecipient.id);
            for (let i = currIndex + 1; i < queue.length; i++) {
                if (queue[i].contact.phone) return queue[i];
            }
            for (let i = 0; i <= currIndex; i++) {
                if (queue[i].contact.phone) return queue[i];
            }
        }
    }
    return null;
};
