const searchStringOrNull = (orig, substring) => {
  const idx = orig.search(substring);

  if (idx === -1)
    return null;

  return idx;
};

module.exports.getDecodedParams = function getDecodedParams(str) {
  const idx1 = searchStringOrNull(str, '_1_');
  const idx2 = searchStringOrNull(str, '_2_');
  const idx3 = searchStringOrNull(str, '_3_');
  const idx4 = searchStringOrNull(str, '_4_');
  // let idx4 = str.search("_ym_")
  let utmSource;
  let utmMedium;
  let utmCampaign;
  let ref;

  if (idx1 !== null)
    utmSource = str.substring(idx1 + 3, idx2 || idx3 || idx4 || str.length);

  if (idx2 !== null)
    utmMedium = str.substring(idx2 + 3, idx3 || idx4 || str.length);

  if (idx3 !== null)
    utmCampaign = str.substring(idx3 + 3, idx4 || str.length);

  if (idx4 !== null)
    ref = str.substring(idx4 + 3, str.length);

  return {
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    ref,
  };
};
