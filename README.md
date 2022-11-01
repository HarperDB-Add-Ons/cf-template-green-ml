# HarperDB GREEN ML

Using the Carbon Aware API to run ML workloads.

This HarperDB Custom Function is powered by the Carbon Aware API.

When hitting either the /train or /infer endpoints, the request is relayed to the node with the lowest carbon impact.

## Setup

To run this CF, ensure the [Carbon Aware API](https://github.com/Green-Software-Foundation/carbon-aware-sdk) is running.
Set the CARBON_SDK_URL environment variable to the URL of the Carbon Aware API.

Run the `setup.js` script like so:
`node setup.js [HarperDB_API_URL] [NAME] [LOCATION] [CF_URL] [NAME_OF_PRIMARY] [CLUSTER_HOST_API] [CLUSTER_HOST_NAME]`

Example for the primary:
`node setup.js http://localhost:9905 EAST_NODE eastus http://host.docker.internal:9906 PRIMARY NO NO`

Example for the secondary:
`node setup.js http://localhost:9915 WEST_NODE westus http://host.docker.internal:9916 http://host.docker.internal:9905 host.docker.internal EAST_NODE`

## Carbon Aware API

To run the Carbon Aware API, clone the repo and start the docker container.
A WattTime API account will be needed.

`git clone https://github.com/Green-Software-Foundation/carbon-aware-sdk`
`cd src`
`docker build -t carbon-aware-sdk-webapi -f CarbonAware.WebApi/src/Dockerfile .`

```
docker run -it --rm -p 8080:80 \
    -e CarbonAwareVars__CarbonIntensityDataSource="WattTime" \
    -e WattTimeClient__Username="WattTimeUSERNAME" \
    -e WattTimeClient__Password='WattTimePASSWORD' \
    carbon-aware-sdk-webapi
```

## Easy Local Setup

With the Carbon Aware API running, use the Makefile to start the two instances.
Start the primary instance `make`
Start the secondary instance `make two`

## ML

There is a TensorFlow.js recommender model installed in this Custom Function.
It will train on a [grocery store dataset](https://www.kaggle.com/datasets/heeraldedhia/groceries-dataset) that's been saved to `training_data.json`
**All ML workloads (training, inference) will be ran on the greenest node**
Check the headers `hdb-greenest-node` to see where the workload was actually ran.

### Training

To train the model on the greenest node by making a GET to http://localhost:9906/green-ml/train

## Inference

To make a recommendation with the model on the greenest node, make a GET to http://localhost:9906/green-ml/infer
