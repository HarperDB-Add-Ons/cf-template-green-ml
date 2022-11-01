import sampleSize from 'lodash/sampleSize.js	';

import * as tf from '@tensorflow/tfjs-node';

const nItems = 168;
const embeddingSize = 50;

const buildModel = () => {
	const itemsInCart = tf.input({ shape: [3] });
	const itemsInCartEmbedding = tf.layers
		.embedding({
			inputDim: nItems,
			outputDim: embeddingSize,
			embeddingsInitializer: 'heNormal',
			embeddingsRegularizer: tf.regularizers.l2({ l2: 1e-6 }),
		})
		.apply(itemsInCart);

	const deep1 = tf.layers.dense({ units: 50 }).apply(itemsInCartEmbedding);
	const deep2 = tf.layers.dense({ units: 50 }).apply(deep1);

	const flat = tf.layers.flatten().apply(deep2);

	const deepFlat1 = tf.layers.dense({ units: 500, activation: 'relu' }).apply(flat);
	const deepFlat2 = tf.layers.dense({ units: 500, activation: 'relu' }).apply(deepFlat1);
	const deepFlat3 = tf.layers.dense({ units: 250, activation: 'relu' }).apply(deepFlat2);

	const output = tf.layers.dense({ units: nItems, activation: 'softmax' }).apply(deepFlat3);

	const model = tf.model({ inputs: itemsInCart, outputs: output });
	model.compile({
		optimizer: 'sgd',
		loss: 'sparseCategoricalCrossentropy',
		metrics: ['accuracy'],
	});
	return model;
};

const train = async (model, purchases, onBatchEnd) => {
	const trainingData = [];
	purchases.forEach((purchase) => {
		const { items } = purchase;
		if (items.length >= 4) {
			for (let i = 0; i < items.length; i++) {
				const features = sampleSize(items, 4);
				const label = features.pop();
				trainingData.push({ features, label });
			}
		}
	});

	const xs = trainingData.map((d) => d.features);
	const ys = trainingData.map((d) => d.label);
	const xTensor = tf.tensor(xs);
	const yTensor = tf.tensor(ys);

	return new Promise((r) => {
		model
			.fit(xTensor, yTensor, {
				epochs: 1,
				batchSize: 16,
				callbacks: { onBatchEnd },
			})
			.then(async () => {
				await model.save('file://model');
				r();
			});
	});
};

export default {
	buildModel,
	train,
};
