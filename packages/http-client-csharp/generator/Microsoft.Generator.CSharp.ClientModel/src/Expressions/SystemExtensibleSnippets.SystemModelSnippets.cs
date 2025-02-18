// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.ClientModel.Primitives;
using Microsoft.Generator.CSharp.Expressions;

namespace Microsoft.Generator.CSharp.ClientModel.Expressions
{
    internal partial class SystemExtensibleSnippets
    {
        internal class SystemModelSnippets : ModelSnippets
        {
            public override CSharpMethod BuildFromOperationResponseMethod(TypeProvider typeProvider, MethodSignatureModifiers modifiers)
            {
                var result = new Parameter("response", $"The result to deserialize the model from.", typeof(PipelineResponse), null, ValidationType.None, null);
                return new CSharpMethod
                (
                    new MethodSignature(ClientModelPlugin.Instance.Configuration.ApiTypes.FromResponseName, null, $"Deserializes the model from a raw response.", modifiers, typeProvider.Type, null, new[] { result }),
                    new MethodBodyStatement[]
                    {
                        Snippets.UsingVar("document", JsonDocumentExpression.Parse(new PipelineResponseExpression(result).Content), out var document),
                        Snippets.Return(ObjectTypeExpression.Deserialize(typeProvider, document.RootElement))
                    },
                    "default"
                );
            }
        }
    }
}
