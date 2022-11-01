import axios from 'axios';
import modelHelper from '../helpers/modelHelper.js';
import sample from 'lodash/sample.js';
import sampleSize from 'lodash/sampleSize.js';
import fs from 'fs';

import * as tf from '@tensorflow/tfjs-node';

const SCHEMA = 'hdb_green';
const { NODE_NAME } = process.env;

import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';

function getName() {
	const randomName = uniqueNamesGenerator({ dictionaries: [adjectives, animals] });

	const shortName = uniqueNamesGenerator({
		dictionaries: [adjectives, animals],
		length: 2,
	});

	return shortName;
}

import { findGreenestNode } from '../helpers/greenHelper.js';

export default async (server, { hdbCore, logger }) => {
	server.route({
		url: '/train',
		method: 'GET',
		preValidation: async (request, reply, done) => {
			// FIND BEST LOCATION
			if (request.query.green === 'GREEN') {
				return done();
			}
			const node = await findGreenestNode({ hdbCore, logger, schema: SCHEMA, table: 'nodes' });
			reply.header('hdb-greenest-node', node.id);
			if (node.id === NODE_NAME) return done();
			reply.header('hdb-rerouted', 'true');
			const { data } = await axios(`${node.url}${request.url}?green=GREEN`);
			return reply.code(200).send(data);
		},
		handler: async (request, reply) => {
			// reply.header('hdb-rerouted', 'false');
			const data = await hdbCore.requestWithoutAuthentication({
				body: {
					operation: 'search_by_value',
					schema: SCHEMA,
					table: 'training_data',
					search_attribute: 'id',
					search_value: '*',
					get_attributes: ['*'],
				},
			});

			const model = modelHelper.buildModel();
			const name = getName();

			await hdbCore.requestWithoutAuthentication({
				body: {
					operation: 'insert',
					schema: SCHEMA,
					table: 'models',
					records: [
						{
							id: name,
							state: 'created',
						},
					],
				},
			});

			modelHelper
				.train(model, data, async (batch, { acc }) => {
					console.log('batch', batch);
					console.log('acc', acc);
					await hdbCore.requestWithoutAuthentication({
						body: {
							operation: 'update',
							schema: SCHEMA,
							table: 'models',
							records: [
								{
									id: name,
									state: 'training',
									batch,
									acc,
								},
							],
						},
					});
				})
				.then(async (r) => {
					const record = {
						files: [],
						id: name,
						state: 'ready',
					};
					const modelJson = fs.readFileSync('model/model.json');
					record.files.push({
						filename: 'model.json',
						data: modelJson,
					});
					const weightsBin = fs.readFileSync('model/weights.bin');
					record.files.push({
						filename: 'weights.bin',
						data: weightsBin,
					});
					await hdbCore.requestWithoutAuthentication({
						body: {
							operation: 'update',
							schema: 'hdb_green',
							table: 'models',
							records: [record],
						},
					});
				});

			return reply.code(200).send('Training started on ' + NODE_NAME);
		},
	});

	server.route({
		url: '/infer',
		method: 'GET',
		preValidation: async (request, reply, done) => {
			// FIND BEST LOCATION
			if (request.query.green === 'GREEN') {
				return done();
			}
			const node = await findGreenestNode({ hdbCore, logger, schema: SCHEMA, table: 'nodes' });
			reply.header('hdb-greenest-node', node.id);
			if (node.id === NODE_NAME) return done();
			reply.header('hdb-rerouted', 'true');
			const { data } = await axios(`${node.url}${request.url}?green=GREEN`);
			return reply.code(200).send(data);
		},
		handler: async (request, reply) => {
			// reply.header('hdb-rerouted', 'false');
			const data = await hdbCore.requestWithoutAuthentication({
				body: {
					operation: 'search_by_value',
					schema: SCHEMA,
					table: 'training_data',
					search_attribute: 'id',
					search_value: '*',
					get_attributes: ['*'],
				},
			});
			const items = await hdbCore.requestWithoutAuthentication({
				body: {
					operation: 'search_by_value',
					schema: SCHEMA,
					table: 'item_idxs',
					search_attribute: 'id',
					search_value: '*',
					get_attributes: ['*'],
				},
			});
			const itemLookup = items.reduce((a, b) => {
				b[a.idx] = a.item;
				return b;
			}, {});

			const example = sample(data.filter((d) => d.items.length >= 4));

			const deployedModels = await hdbCore.requestWithoutAuthentication({
				body: {
					operation: 'sql',
					sql: 'select * from hdb_green.models ORDER BY __createdtime__ DESC LIMIT 1',
				},
			});

			try {
				fs.mkdirSync('infer_model');
			} catch (error) {
				console.log('dir already exists');
			}

			deployedModels[0].files.forEach((modelFile) => {
				fs.writeFileSync(`infer_model/${modelFile.filename}`, Buffer.from(modelFile.data, 'base64'));
			});

			const model = await tf.loadLayersModel(`file://infer_model/model.json`);

			const features = sampleSize(example.items, 3);
			const xTensor = tf.tensor([features]);

			const predictionsTensor = model.predict(xTensor);
			const predictions = predictionsTensor.argMax(1).dataSync();
			console.log('predictions', predictions);
		},
	});
};
