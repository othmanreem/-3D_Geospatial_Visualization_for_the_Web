The zipped file contains the data (map.nc) and several auxiliary functions depending on the configuration of the exported product and the uncertainty representation method.
For projections:
- Simple uncertainty representation: In the Interactive Atlas change signals appear hatched whenever "consensus" is smaller than 0.8 
- Advanced uncertainty representation: The advanced representation method combines "consensus" and "robustness", as explained in  https://ipcc-atlas.predictia.es/regional-information/about
For observations/reanalysis:
- In the Interactive Atlas trends appear hatched whenever "trend p-value" is smaller than 0.9 

The files contain:
- Consensus: Model agreement, computed as the percentage of models that agree with the ensemble mean. Values between 0 and 1.
- Robustness: Percentage of models with a robust signal, meaning that the computed anomaly is greater than the threshold of the natural climatic variability of 20-year mean values. Values between 0 and 1.  More information in: https://ipcc-atlas.predictia.es/regional-information/about [Robustness and uncertainty section]
- Trend p-value: The p-values of the linear trend for observational and reanalysis products. Values between 0 and 1.