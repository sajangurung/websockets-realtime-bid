// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });

const { TABLE_NAME } = process.env;

const update = async (connectionId, bid) => {

  const params = {
    TableName: TABLE_NAME,
    Key: { connectionId: connectionId },
    UpdateExpression: 'set #bids = list_append(if_not_exists(#bids, :empty_list), :bid), #currentMaxBid = :maxBid',
    ConditionExpression: "currentMaxBid < :maxBid",
    ExpressionAttributeNames: {
      '#bids': 'bid',
      '#currentMaxBid': 'currentMaxBid'
    },
    ExpressionAttributeValues: {
      ':bid': [bid],
      ':maxBid': bid,
      ':empty_list': []
    },
    ReturnValues: 'UPDATED_NEW'
  };

  console.log('Params', params);
  try {
    const { Attributes } = await ddb.update(params).promise();
    return Attributes;
  } catch (e) {
    console.log('Error updating db:', e.stack);
  }
}

exports.handler = async (event, context) => {
  let connectionData;

  try {
    connectionData = await ddb.scan({ TableName: TABLE_NAME, ProjectionExpression: 'connectionId' }).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });

  const postData = JSON.parse(event.body).data;

  if (isNaN(postData)) {
    return { statusCode: 400, body: 'Please provide a number to bid' };
  }

  const postCalls = connectionData.Items.map(async ({ connectionId }) => {
    const bid = parseFloat(postData);

    const params = {
      TableName: TABLE_NAME,
      Key: { connectionId: connectionId },
      UpdateExpression: 'set #bids = list_append(if_not_exists(#bids, :empty_list), :bid), #currentMaxBid = :maxBid',
      ConditionExpression: "currentMaxBid < :maxBid",
      ExpressionAttributeNames: {
        '#bids': 'bid',
        '#currentMaxBid': 'currentMaxBid'
      },
      ExpressionAttributeValues: {
        ':bid': [bid],
        ':maxBid': bid,
        ':empty_list': [],
      },
      ReturnValues: 'UPDATED_NEW'
    };

    try {
      await ddb.update(params).promise();
    } catch (e) {
      console.log('Error updating db:', e.stack);
    }

    try {
      await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: postData }).promise();
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });

  try {
    await Promise.all(postCalls);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: 'Data sent.' };
};
