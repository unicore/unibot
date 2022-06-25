async function lazyFetchAllTableInternal(api, code, scope, table, lower_bound, upper_bound, limit, index_position, key_type) {
  if (!limit) limit = 100;
  if (!lower_bound) lower_bound = 0;

  const data = await api.getTableRows({
    json: true, code, scope, table, lower_bound, upper_bound, limit, index_position, key_type,
  });
  let result = data.rows;

  if (data.more === true) {
    // eslint-disable-next-line max-len
    const redata = await lazyFetchAllTableInternal(api, code, scope, table, data.next_key, upper_bound, limit, index_position, key_type);
    result = [...result, ...redata];
    return result;
  }
  return result;
}

// async function lazyFetchAllTableInternal(
//   api,
//   code,
//   scope,
//   table,
//   lowerBoundOriginal,
//   upperBound,
//   limit,
//   indexPosition,
//   keyType,
// ) {
//   const lowerBound = lowerBoundOriginal || 0;
//   const data = await api.getTableRows({
//     json: true,
//     code,
//     scope,
//     table,
//     lowerBound,
//     upperBound,
//     limit: limit || 100,
//     indexPosition,
//     keyType,
//   });

//   const result = data.rows;

//   if (data.more === true && lowerBound !== upperBound) {
//     const redata = await lazyFetchAllTableInternal(
//       api,
//       code,
//       scope,
//       table,
//       data.next_key,
//       upperBound,
//       limit,
//       indexPosition,
//       keyType,
//     );
//     return [...result, ...redata];
//   }

//   return result;
// }

module.exports.lazyFetchAllTableInternal = lazyFetchAllTableInternal;
