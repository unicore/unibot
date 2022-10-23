const SECONDS_IN_MINUTES = 60;
const SECONDS_IN_HOURS = 60 * SECONDS_IN_MINUTES;
const SECONDS_IN_DAYS = SECONDS_IN_HOURS * 24;

const extractSecondsFromTimestamp = (timestamp) => Math.floor(timestamp % SECONDS_IN_MINUTES);
const extractMinutesFromTimestamp = (timestamp) => (
  Math.floor((timestamp % SECONDS_IN_HOURS) / SECONDS_IN_MINUTES)
);
// eslint-disable-next-line max-len
const extractHoursFromTimestamp = (timestamp) => Math.floor((timestamp % SECONDS_IN_DAYS) / SECONDS_IN_HOURS);
const extractDaysFromTimestamp = (timestamp) => Math.floor(timestamp / SECONDS_IN_DAYS);

const EXTRACT_TIMESTAMP_RULES = {
  дн: extractDaysFromTimestamp,
  ч: extractHoursFromTimestamp,
  мин: extractMinutesFromTimestamp,
  сек: extractSecondsFromTimestamp,
};

module.exports.timestampToDHMS = (timestampOriginal) => {
  const timestamp = Number(timestampOriginal);
  const parts = Object.keys(EXTRACT_TIMESTAMP_RULES).map((timeWord) => {
    const timePart = EXTRACT_TIMESTAMP_RULES[timeWord](timestamp);

    if (timePart)
      return `${timePart} ${timeWord}`;

    return null;
  }).filter(Boolean);

  return parts.join(', ');
};
