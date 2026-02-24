Build dynamic ML pipeline builder.

User selects:
- Dataset
- Target column
- Feature columns
- Train-test split
- Model (RandomForest, XGBoost, LogisticRegression, SVM, CNN, Transformers)
- Hyperparameters

System should:
- Validate inputs
- Build sklearn pipeline
- Train model
- Evaluate metrics
- Save model
- Generate ipynb
- Provide prediction API endpoint
- Generate GUI prediction handler
