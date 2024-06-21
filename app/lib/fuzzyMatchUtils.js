const availableColumns = [
    "firstname",
    "surname",
    "phone",
    "email",
    "address",
    "city",
    "carrier",
    "opt_out",
    "created_at",
    "workspace",
    "external_id",
    "address_id",
    "postal",
  ];
  
  const similarity = (s1, s2) => {
    let longer = s1;
    let shorter = s2;
    if (s1.length < s2.length) {
      longer = s2;
      shorter = s1;
    }
    const longerLength = longer.length;
    if (longerLength === 0) {
      return 1.0;
    }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
  };
  
  const editDistance = (s1, s2) => {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
  
    const costs = new Array();
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) costs[j] = j;
        else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) !== s2.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };
  
  const fuzzyMatchHeaders = (headers, availableColumns) => {
    const matchedHeaders = {};
    headers.forEach((header, index) => {
      let bestMatch = '';
      let highestSimilarity = 0;
      availableColumns.forEach((column) => {
        const sim = similarity(header, column);
        if (sim > highestSimilarity) {
          highestSimilarity = sim;
          bestMatch = column;
        }
      });
      if (highestSimilarity > 0.7) {
        console.log(header, bestMatch)
        matchedHeaders[bestMatch] = index;
      } else {
        if (!matchedHeaders['other_data']) {
          matchedHeaders['other_data'] = [];
        }
        matchedHeaders['other_data'].push({ [header]: index });
      }
    });
    
    return matchedHeaders;
  };
  
  export const parseCSVHeaders = (unparsedHeaders) => {
    const trimmedHeaders = unparsedHeaders.map((header) =>
      header.toLowerCase().replace(/\W/g, "")
    );
  
    const parsedHeaders = fuzzyMatchHeaders(trimmedHeaders, availableColumns);
  
    const requiredFields = ["firstname", "surname", "phone", "email", "address"];
    requiredFields.forEach(field => {
      if (!(field in parsedHeaders)) {
        parsedHeaders[field] = undefined;
      }
    });
  
    console.log('Final parsed headers:', parsedHeaders); // Debugging line
    return parsedHeaders;
  };
  