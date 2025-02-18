// <auto-generated/>

#nullable disable

using System;

namespace UnbrandedTypeSpec.Models
{
    public partial class ModelWithFormat
    {
        /// <summary> Initializes a new instance of <see cref="ModelWithFormat"/>. </summary>
        /// <param name="sourceUrl"> url format. </param>
        /// <param name="guid"> uuid format. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="sourceUrl"/> is null. </exception>
        public ModelWithFormat(System.Uri sourceUrl, Guid guid)
        {
            if (sourceUrl == null)
            {
                throw new ArgumentNullException(nameof(sourceUrl));
            }

            SourceUrl = sourceUrl;
            Guid = guid;
        }

        /// <summary> Initializes a new instance of <see cref="ModelWithFormat"/> for deserialization. </summary>
        internal ModelWithFormat()
        {
        }

        /// <summary> url format. </summary>
        public System.Uri SourceUrl { get; set; }

        /// <summary> uuid format. </summary>
        public Guid Guid { get; set; }

        // Add Nested Type
    }
}
