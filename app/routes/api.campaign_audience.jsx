import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

const logError = (error, method) => {
  console.error(`Error in ${method} operation:`, error);
};

const handleDatabaseOperation = async (operation, errorMessage) => {
  const { data, error } = await operation();
  if (error) throw new Error(`${errorMessage}: ${error.message}`);
  return data;
};

const handleResponse = (data, headers) => {
  return json(data, { headers });
};

const handleError = (error, headers) => {
  logError(error, error.method);
  return json({ error: error.message }, { status: 400, headers });
};

const handlePutOperation = async (supabaseClient, data) => {
  //console.log('PUT request data:', data);
  const existing = await handleDatabaseOperation(
    () => supabaseClient.from('campaign_audience').select().eq('campaign_id', data.campaign_id),
    'Error fetching existing campaign audience'
  );

  const toDelete = existing.filter((row) => !data.updated.some(updatedRow => updatedRow.audience_id === row.audience_id));
  const toAdd = data.updated.filter((updatedRow) => !existing.some(row => row.audience_id === updatedRow.audience_id));

  let addedData = [];
  if (toAdd.length > 0) {
    addedData = await handleDatabaseOperation(
      () => supabaseClient.from('campaign_audience')
        .upsert(toAdd.map((row) => ({ audience_id: row.audience_id, campaign_id: data.campaign_id })),
          { onConflict: ['audience_id', 'campaign_id'] })
        .select(),
      'Error adding campaign audience'
    );
  }

  let deletedData = [];
  if (toDelete.length > 0) {
    deletedData = await handleDatabaseOperation(
      () => supabaseClient.from('campaign_audience')
        .delete()
        .in('audience_id', toDelete.map((row) => row.audience_id))
        .eq('campaign_id', data.campaign_id)
        .select(),
      'Error deleting campaign audience'
    );
  }

  return { added: addedData, deleted: deletedData };
};

const handlePostOperation = async (supabaseClient, data) => {
  //console.log('POST request data:', data);
  try {
    const {data: result, error} = await handleDatabaseOperation(
      () => supabaseClient.from('campaign_audience').insert(data).select(`*`),
      'Error creating campaign audience'
    );
    if (error) throw new Error(`${error.message}`);
    return { success: true};
  } catch (error) {
    throw new Error(`${error.message}`);
  }
};


const handleDeleteOperation = async (supabaseClient, data) => {
  //console.log('DELETE request data:', data);
  return handleDatabaseOperation(
    () => supabaseClient.from('campaign_audience').delete().eq('audience_id', data.audience_id),
    'Error removing campaign audience'
  );
};

export const action = async ({ request }) => {
  const { supabaseClient, headers } = await getSupabaseServerClientWithSession(request);
  const method = request.method;

  try {
    const data = await request.json();
    let response;

    switch (method) {
      case 'PUT':
        response = await handlePutOperation(supabaseClient, data);
        break;
      case 'POST':
        response = await handlePostOperation(supabaseClient, data);
        break;
      case 'DELETE':
        response = await handleDeleteOperation(supabaseClient, data);
        break;
      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    //console.log(`${method} operation successful:`, response);
    return handleResponse(response, headers);
  } catch (error) {
    error.method = method;
    return handleError(error, headers);
  }
};